const API = "https://myteam.swordgale.online/api";
const storeKey = "autoy.accounts.v1";
let accounts = JSON.parse(localStorage.getItem(storeKey) || "[]");
let activeId = accounts[0]?.id || null;
let heroes = [];
let timer = null;
let running = false;
let cooldownAt = 0;
let restUntil = 0;
let canForward = null;
const $ = (id) => document.getElementById(id);
const safe = (text) => String(text).replace(/[<>&]/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;"})[c]);
const active = () => accounts.find((a) => a.id === activeId);
function save() { localStorage.setItem(storeKey, JSON.stringify(accounts)); }
function log(message) { $("events").textContent = `[${new Date().toLocaleTimeString()}] ${message}\n` + $("events").textContent.slice(0, 7000); }
function config() { return { target: Number($("target-stage").value), hp: Number($("hp-target").value), sp: Number($("sp-target").value), restMinutes: Number($("rest-minutes").value) }; }
function validConfig(c) { return Number.isInteger(c.target) && c.target > 0 && c.hp >= 1 && c.hp <= 100 && c.sp >= 1 && c.sp <= 100 && c.restMinutes > 0; }
async function request(path, options = {}) {
  const account = active(); if (!account) throw new Error("請先選擇帳號");
  const response = await fetch(`${API}${path}`, { ...options, headers: { token: account.token, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  const rotatedToken = response.headers.get("token");
  if (rotatedToken && rotatedToken !== account.token) { account.token = rotatedToken.replace(/^Bearer\s+/i, ""); save(); renderAccounts(); log("已更新 API token"); }
  return response.json();
}
async function refresh() {
  const data = await request("/heroes"); heroes = data.heroes || [];
  renderHeroes(); log(`已讀取 ${heroes.length} 張角色卡`); return heroes;
}
function renderAccounts() {
  $("accounts").innerHTML = accounts.map((a) => `<div class="account ${a.id === activeId ? "active" : ""}"><button data-select="${a.id}">${safe(a.label)}</button><small>••••${safe(a.token.slice(-6))}</small><button data-delete="${a.id}">移除</button></div>`).join("");
  document.querySelectorAll("[data-select]").forEach((b) => b.onclick = () => { stop(); activeId = b.dataset.select; render(); });
  document.querySelectorAll("[data-delete]").forEach((b) => b.onclick = () => { stop(); accounts = accounts.filter((a) => a.id !== b.dataset.delete); activeId = accounts[0]?.id || null; save(); render(); });
}
function renderHeroes() {
  $("heroes").innerHTML = heroes.map((h) => `<article class="hero"><strong>${safe(h.name)}</strong><p>樓層 ${h.huntStage ?? "-"} · ${safe(h.zoneName || "-")}</p><p>HP ${h.hp}/${h.fullHp} · SP ${h.sp}/${h.fullSp}</p><p>${h.perished ? "已死亡" : h.canComplete ? "可完成行動" : "狀態 " + h.actionState}</p></article>`).join("");
}
function render() { renderAccounts(); const account = active(); $("automation-card").hidden = !account; if (account) $("active-label").textContent = account.label; renderHeroes(); setState(); }
function setState(message) { const el = $("run-state"); el.textContent = message || (running ? "運行中" : "已停止"); el.classList.toggle("running", running); }
function pct(current, max) { return max > 0 ? (current / max) * 100 : 0; }
function needsRest(c) { return heroes.some((h) => h.perished || pct(h.hp,h.fullHp) < c.hp || pct(h.sp,h.fullSp) < c.sp); }
function stage() { return heroes[0]?.huntStage; }
function schedule(ms) { clearTimeout(timer); timer = setTimeout(turn, Math.max(1000, ms)); }
function stop(reason = "已停止") { running = false; clearTimeout(timer); timer = null; setState(reason); }
async function rest(c) {
  if (restUntil && Date.now() < restUntil) return schedule(restUntil - Date.now());
  if (heroes.some((h) => h.canComplete)) {
    const result = await request("/heroes/restAll/complete", { method:"POST" }); heroes = result.huntInfo?.heroes || heroes; canForward = result.huntInfo?.canForward ?? canForward; restUntil = 0; renderHeroes(); log("全部完成休息"); return schedule(1000);
  }
  const result = await request("/heroes/restAll", { method:"POST" }); heroes = result.heroes || heroes; canForward = result.canForward ?? canForward;
  const serverUntil = Math.max(...heroes.map((h) => Date.parse(h.actionCompleteTime || 0)), Date.now());
  restUntil = Math.max(serverUntil, Date.now() + c.restMinutes * 60000); renderHeroes(); log("全部休息，等待完成"); schedule(restUntil - Date.now());
}
async function hunt(c) {
  if (Date.now() < cooldownAt) return schedule(cooldownAt - Date.now());
  const current = stage(); if (!Number.isInteger(current)) throw new Error("找不到目前樓層");
  if (current > c.target) throw new Error("目前樓層已超過目標，未啟用自動後退");
  const forward = current < c.target;
  if (forward && canForward !== true) throw new Error("尚未確認可前行；請先讓隊伍完成一次休息並重新讀取狀態");
  const result = await request(forward ? "/hunt?type=forward" : "/hunt", { method:"POST" });
  heroes = result.huntInfo?.heroes || heroes; canForward = result.huntInfo?.canForward ?? canForward; cooldownAt = Date.parse(result.huntInfo?.huntAvailableAt || 0); renderHeroes(); log(forward ? "前行完成" : "原地狩獵完成"); schedule(Math.max(1000, cooldownAt - Date.now()));
}
async function turn() {
  if (!running) return;
  try { const c = config(); if (!validConfig(c)) throw new Error("請檢查自動狩獵設定"); await refresh(); if (heroes.some((h) => h.perished)) throw new Error("隊伍中有死亡角色"); if (needsRest(c)) await rest(c); else await hunt(c); } catch (error) { log(error.message || String(error)); stop("已因錯誤停止"); }
}
$("account-form").onsubmit = (event) => { event.preventDefault(); const label = $("account-label").value.trim(); const token = $("account-token").value.trim().replace(/^Bearer\s+/i, ""); if (!label || !token) return; const account = { id: crypto.randomUUID(), label, token }; accounts.push(account); activeId = account.id; save(); event.target.reset(); render(); log("已新增帳號；請重新讀取驗證 token"); };
$("refresh").onclick = () => refresh().catch((e) => log(e.message));
$("start").onclick = () => { if (!active()) return; running = true; cooldownAt = 0; restUntil = 0; setState(); turn(); };
$("stop").onclick = () => stop();
render();
