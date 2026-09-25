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
let nextWakeAt = 0;
let watchdog = null;
let requestAborter = null;
let accountActionId = null;
const recoveryRequests = new Set();
const recoveryTimers = new Map();
const $ = (id) => document.getElementById(id);
const safe = (text) => String(text).replace(/[<>&]/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;"})[c]);
const active = () => accounts.find((a) => a.id === activeId);
function save() { localStorage.setItem(storeKey, JSON.stringify(accounts)); }
function clearRecoveryTimers() {
  for (const entry of recoveryTimers.values()) clearTimeout(entry.timer);
  recoveryTimers.clear();
}
function loadSettings(account = active()) {
  if (!account) return;
  const defaults = { target: 1, hp: 80, sp: 70, restMinutes: 1, alertMinutes: 3 };
  account.settings = { ...defaults, ...(account.settings || {}) };
  $("target-stage").value = account.settings.target;
  $("hp-target").value = account.settings.hp;
  $("sp-target").value = account.settings.sp;
  $("rest-minutes").value = account.settings.restMinutes;
  $("alert-minutes").value = account.settings.alertMinutes;
}
function persistSettings() {
  const account = active();
  if (!account) return;
  account.settings = config();
  save();
}
async function withAccountLock(operation) {
  if (accountActionId) return;
  accountActionId = activeId;
  try { await operation(); } finally { accountActionId = null; }
}
function log(message) { const label = active()?.label; const prefix = label ? `[${label}] ` : ""; $("events").textContent = `[${new Date().toLocaleTimeString()}] ${prefix}${message}\n` + $("events").textContent.slice(0, 7000); }
function config() { return { target: Number($("target-stage").value), hp: Number($("hp-target").value), sp: Number($("sp-target").value), restMinutes: Number($("rest-minutes").value), alertMinutes: Number($("alert-minutes").value) }; }
function validConfig(c) { return Number.isInteger(c.target) && c.target > 0 && c.hp >= 1 && c.hp <= 100 && c.sp >= 1 && c.sp <= 100 && c.restMinutes > 0 && c.alertMinutes >= 1; }
async function request(path, options = {}, accountId = activeId) {
  const account = accounts.find((entry) => entry.id === accountId); if (!account) throw new Error("請先選擇帳號");
  requestAborter = new AbortController();
  const response = await fetch(`${API}${path}`, { ...options, signal: requestAborter.signal, headers: { token: account.token, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  const rotatedToken = response.headers.get("token");
  if (rotatedToken && rotatedToken !== account.token) { account.token = rotatedToken.replace(/^Bearer\s+/i, ""); save(); renderAccounts(); log("已更新 API token"); }
  return response.json();
}
async function refresh(accountId = activeId) {
  const data = await request("/heroes", {}, accountId);
  if (accountId !== activeId) return data.heroes || [];
  heroes = data.heroes || [];
  renderHeroes(); log(`已讀取 ${heroes.length} 張角色卡`); return heroes;
}
async function refreshAccount(accountId = activeId) {
  const [heroData, huntInfo] = await Promise.all([request("/heroes", {}, accountId), request("/huntInfo", {}, accountId)]);
  if (accountId !== activeId) return;
  heroes = heroData.heroes || [];
  canForward = huntInfo.canForward ?? null;
  cooldownAt = Date.parse(huntInfo.huntAvailableAt || 0) || 0;
  renderHeroes();
  log(`已載入帳號狀態：${heroes.length} 張角色卡，${huntInfo.zoneName || "位置未知"} ${huntInfo.huntStage ?? "?"} 層`);
}
function renderAccounts() {
  $("accounts").innerHTML = accounts.map((a) => `<div class="account ${a.id === activeId ? "active" : ""}"><button data-select="${a.id}">${safe(a.label)}</button><small>token 已設定</small><button data-delete="${a.id}">移除</button></div>`).join("");
  document.querySelectorAll("[data-select]").forEach((b) => b.onclick = () => {
    if (b.dataset.select === activeId) return;
    if (accountActionId) { log("目前帳號操作尚未完成，請稍後再切換"); return; }
    if (running) stop();
    clearRecoveryTimers(); activeId = b.dataset.select; heroes = []; cooldownAt = 0; restUntil = 0; canForward = null; loadSettings(); render();
    refreshAccount().catch((error) => log(`讀取帳號資料失敗：${error.message || error}`));
  });
  document.querySelectorAll("[data-delete]").forEach((b) => b.onclick = () => {
    if (accountActionId) { log("目前帳號操作尚未完成，請稍後再移除帳號"); return; }
    const deletingActive = b.dataset.delete === activeId;
    if (deletingActive) { stop(); clearRecoveryTimers(); heroes = []; }
    accounts = accounts.filter((a) => a.id !== b.dataset.delete);
    if (deletingActive) activeId = accounts[0]?.id || null;
    save();
    if (active()) loadSettings();
    render();
    if (deletingActive && active()) refreshAccount().catch((error) => log(`讀取帳號資料失敗：${error.message || error}`));
  });
}
function renderHeroes() {
  $("heroes").innerHTML = heroes.map((h) => {
    const recovery = deathState(h);
    const reviving = recovery === "death" && Number(h.actionState) === 3;
    const moving = Number(h.actionState) === 1;
    const resting = Number(h.actionState) === 2;
    const status = recovery === "final-death" ? "死透了：需要轉生後復活" : reviving ? `重生中，完成時間 ${formatTime(h.actionCompleteTime)}` : recovery === "death" ? "死亡：需要重生／復活" : moving ? `移動中，完成時間 ${formatTime(h.actionCompleteTime)}` : resting ? `休息中，完成時間 ${formatTime(h.actionCompleteTime)}${h.canComplete === true ? "（可完成）" : ""}` : h.canComplete ? "可完成行動" : `狀態 ${h.actionState}`;
    const recoveryLink = recovery ? `<a class="recovery-link" href="https://myteam.swordgale.online/heroes/${encodeURIComponent(h.id)}" target="_blank" rel="noopener noreferrer">前往遊戲手動復原</a>` : "";
    return `<article class="hero ${recovery ? "hero-dead" : ""}"><strong>${safe(h.name)}</strong><p>樓層 ${h.huntStage ?? "-"} · ${safe(h.zoneName || "-")}</p><p>HP ${h.hp}/${h.fullHp} · SP ${h.sp}/${h.fullSp}</p><p>${status}</p>${recoveryLink}</article>`;
  }).join("");
  const ordinaryDeaths = heroes.filter((h) => deathState(h) === "death");
  for (const hero of heroes) {
    const waitingForRecovery = deathState(hero) === "death" && Number(hero.actionState) === 3;
    const waitingForMove = Number(hero.actionState) === 1;
    const timerKey = String(hero.id);
    const existingTimer = recoveryTimers.get(timerKey);
    if ((!waitingForRecovery && !waitingForMove) || hero.canComplete === true || !hero.actionCompleteTime) {
      if (existingTimer && (!waitingForRecovery && !waitingForMove || hero.canComplete === true)) {
        clearTimeout(existingTimer.timer);
        recoveryTimers.delete(timerKey);
      }
      continue;
    }
    const dueAt = Date.parse(hero.actionCompleteTime);
    if (!Number.isFinite(dueAt)) continue;
    const scheduled = recoveryTimers.get(timerKey);
    if (scheduled?.dueAt === dueAt) continue;
    if (scheduled) clearTimeout(scheduled.timer);
    const delay = Math.max(1000, dueAt - Date.now() + 2000, dueAt <= Date.now() ? 30000 : 0);
    const timer = setTimeout(async () => {
      recoveryTimers.delete(timerKey);
      try {
        await refresh();
        stopForDeaths();
        log(`${hero.name} 行動預定時間已到；已重新讀取狀態`);
      } catch (error) {
        log(`${hero.name} 行動狀態讀取失敗，請手動重新讀取：${error.message || error}`);
      }
    }, delay);
    recoveryTimers.set(timerKey, { dueAt, timer });
  }
  const readyToComplete = ordinaryDeaths.filter((h) => Number(h.actionState) === 3 && h.canComplete === true);
  const readyToCompleteMove = heroes.some((h) => Number(h.actionState) === 1 && h.canComplete === true);
  const canStartRevive = ordinaryDeaths.some((h) => Number(h.actionState) !== 3);
  const finalDeaths = heroes.filter((h) => deathState(h) === "final-death");
  const hasFinalDeath = finalDeaths.length > 0;
  const controls = [];
  if (ordinaryDeaths.length || hasFinalDeath) controls.push('<button id="return-start" class="primary">回程／返回起點</button>');
  if (readyToCompleteMove) controls.push('<button id="complete-move">完成移動</button>');
  if (canStartRevive) controls.push('<button id="revive-all" class="primary">全部重生</button>');
  for (const h of readyToComplete) {
    controls.push(`<button data-complete-revive="${encodeURIComponent(h.id)}" ${recoveryRequests.has(String(h.id)) ? "disabled" : ""}>完成 ${safe(h.name)} 重生</button>`);
  }
  for (const h of finalDeaths) {
    controls.push(`<button data-reincarnate="${encodeURIComponent(h.id)}" class="danger" ${recoveryRequests.has(String(h.id)) ? "disabled" : ""}>單獨轉生 ${safe(h.name)}</button>`);
  }
  if (hasFinalDeath) controls.push('<a class="recovery-link" href="https://myteam.swordgale.online/heroes" target="_blank" rel="noopener noreferrer">前往遊戲角色頁</a>');
  $("death-actions").innerHTML = ordinaryDeaths.length || hasFinalDeath
    ? `<div class="recovery-actions"><strong>隊伍復原</strong><p>死亡角色可全部重生；重生等待完成且 API 回報可完成後，可逐名完成行動。死透了角色可逐角轉生；轉生會改變角色狀態，送出前會再次確認。</p><div class="actions">${controls.join("")}</div></div>`
    : "";
  const reviveAllButton = $("revive-all");
  if (reviveAllButton) reviveAllButton.onclick = () => withAccountLock(startReviveAll);
  const returnButton = $("return-start");
  if (returnButton) returnButton.onclick = () => withAccountLock(returnToStart);
  const completeMoveButton = $("complete-move");
  if (completeMoveButton) completeMoveButton.onclick = () => withAccountLock(completeMovement);
  document.querySelectorAll("[data-complete-revive]").forEach((button) => {
    button.onclick = () => withAccountLock(() => completeRevive(button.dataset.completeRevive));
  });
  document.querySelectorAll("[data-reincarnate]").forEach((button) => {
    button.onclick = () => withAccountLock(() => reincarnateHero(button.dataset.reincarnate));
  });
}
function formatTime(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "等待伺服器狀態";
}
function render() { renderAccounts(); const account = active(); $("automation-card").hidden = !account; if (account) $("active-label").textContent = account.label; renderHeroes(); setState(); }
function setState(message) { const el = $("run-state"); el.textContent = message || (running ? "運行中" : "已停止"); el.classList.toggle("running", running); }
function deathState(hero) {
  if (hero.perished === true) return "final-death";
  if (Number(hero.hp) <= 0 && hero.perished === false) return "death";
  return null;
}
function stopForDeaths() {
  const deadHeroes = heroes.filter((hero) => deathState(hero));
  if (!deadHeroes.length) return false;
  const summary = deadHeroes.map((hero) => {
    if (deathState(hero) === "final-death") return `${hero.name}：死透了，需轉生後復活`;
    if (Number(hero.actionState) === 3) return `${hero.name}：重生行動進行中`;
    return `${hero.name}：死亡，需開始重生`;
  }).join("；");
  stop("隊伍有死亡角色，已停止");
  warn(`自動狩獵已停止。${summary}。請在下方處理可用的重生操作。`);
  log(`偵測到死亡狀態：${summary}`);
  renderHeroes();
  return true;
}
async function startReviveAll() {
  if (running) stop("偵測到死亡狀態，已停止狩獵");
  if (!heroes.some((hero) => deathState(hero) === "death" && Number(hero.actionState) !== 3)) return;
  try {
    const result = await request("/heroes/reviveAll", { method: "POST" });
    heroes = result.heroes || heroes;
    renderHeroes();
    log("已對可重生角色開始全部重生；死透了角色不會由此端點復原");
    stopForDeaths();
  } catch (error) {
    log(`全部重生失敗：${error.message || error}`);
    warn(`全部重生失敗：${error.message || error}`);
  }
}
async function completeRevive(heroId) {
  const hero = heroes.find((entry) => String(entry.id) === String(heroId));
  if (!hero || deathState(hero) !== "death" || Number(hero.actionState) !== 3 || hero.canComplete !== true) {
    log("角色尚未由 API 確認可完成重生，請重新讀取");
    return;
  }
  recoveryRequests.add(String(hero.id));
  renderHeroes();
  try {
    await request(`/heroes/${encodeURIComponent(hero.id)}/completeAction`, { method: "POST" });
    const data = await request("/heroes");
    heroes = data.heroes || [];
    renderHeroes();
    log(`${hero.name} 已完成重生行動並更新角色狀態`);
    stopForDeaths();
  } catch (error) {
    log(`${hero.name} 重生完成失敗：${error.message || error}`);
    warn(`${hero.name} 重生完成失敗，請重新讀取確認狀態`);
  } finally {
    recoveryRequests.delete(String(hero.id));
    renderHeroes();
  }
}
async function reincarnateHero(heroId) {
  const hero = heroes.find((entry) => String(entry.id) === String(heroId));
  if (!hero || deathState(hero) !== "final-death") {
    log("角色目前不是死透狀態；請重新讀取後再操作");
    return;
  }
  if (!window.confirm(`確定要讓「${hero.name}」單獨轉生嗎？此操作會改變角色狀態。`)) return;
  recoveryRequests.add(String(hero.id));
  renderHeroes();
  try {
    await request(`/heroes/${encodeURIComponent(hero.id)}/reincarnate`, { method: "POST" });
    const data = await request("/heroes");
    heroes = data.heroes || [];
    renderHeroes();
    log(`${hero.name} 已送出單獨轉生並重新讀取角色狀態`);
    if (heroes.some((entry) => String(entry.id) === String(hero.id) && deathState(entry) === "final-death")) {
      warn(`${hero.name} 的轉生請求已成功，但角色仍回報死透狀態；請查看遊戲角色頁確認後續步驟。`);
    } else {
      stopForDeaths();
    }
  } catch (error) {
    log(`${hero.name} 單獨轉生失敗：${error.message || error}`);
    try {
      const latest = await request("/heroes");
      heroes = latest.heroes || heroes;
      renderHeroes();
      const updated = heroes.find((entry) => String(entry.id) === String(hero.id));
      if (updated && deathState(updated) !== "final-death") {
        log(`${hero.name} 的轉生已反映在最新角色狀態`);
      } else {
        warn(`${hero.name} 單獨轉生結果仍未確認。請查看遊戲角色頁，不要直接重複送出。`);
      }
    } catch {
      warn(`${hero.name} 單獨轉生結果未確認，且無法重新讀取。請稍後手動刷新，不要直接重複送出。`);
    }
  } finally {
    recoveryRequests.delete(String(hero.id));
    renderHeroes();
  }
}
async function returnToStart() {
  const affected = heroes.filter((hero) => deathState(hero));
  if (!affected.length) {
    log("目前沒有死亡角色；請重新讀取後再操作");
    return;
  }
  const names = affected.map((hero) => hero.name).join("、");
  if (!window.confirm(`隊伍有死亡角色：${names}。確定執行回程／返回起點嗎？`)) return;
  if (running) stop("死亡角色回程中，已停止狩獵");
  try {
    const result = await request("/move/0", { method: "POST" });
    if (Array.isArray(result.heroes)) heroes = result.heroes;
    canForward = result.canForward ?? canForward;
    cooldownAt = Date.parse(result.huntAvailableAt || 0) || cooldownAt;
    renderHeroes();
    const [latestHeroes, huntInfo] = await Promise.all([request("/heroes"), request("/huntInfo")]);
    heroes = latestHeroes.heroes || heroes;
    canForward = huntInfo.canForward ?? canForward;
    cooldownAt = Date.parse(huntInfo.huntAvailableAt || 0) || cooldownAt;
    renderHeroes();
    const location = `${huntInfo.zoneName || result.zoneName || "位置未知"} 第 ${huntInfo.huntStage ?? result.huntStage ?? "?"} 層`;
    log(`已執行回程／返回起點；最新位置：${location}`);
    if (stopForDeaths()) return;
    warn(`已回程至 ${location}。自動狩獵維持停止，請確認角色狀態後再手動啟動。`);
  } catch (error) {
    log(`回程失敗或結果未確認：${error.message || error}`);
    warn("回程結果未確認。請先重新讀取角色與狩獵狀態，不要直接重複送出。");
  }
}
async function completeMovement() {
  if (!heroes.some((hero) => Number(hero.actionState) === 1 && hero.canComplete === true)) {
    log("移動尚未由 API 確認可完成；請重新讀取角色狀態");
    return;
  }
  if (running) stop("正在完成移動，已停止狩獵");
  try {
    const result = await request("/move/complete", { method: "POST" });
    if (Array.isArray(result.heroes)) heroes = result.heroes;
    canForward = result.canForward ?? canForward;
    renderHeroes();
    const [latestHeroes, huntInfo] = await Promise.all([request("/heroes"), request("/huntInfo")]);
    heroes = latestHeroes.heroes || heroes;
    canForward = huntInfo.canForward ?? canForward;
    cooldownAt = Date.parse(huntInfo.huntAvailableAt || 0) || cooldownAt;
    renderHeroes();
    log(`移動已完成，目前位置：${huntInfo.zoneName || result.zoneName || "未知"}`);
    if (stopForDeaths()) return;
    warn(`移動已完成，位置：${huntInfo.zoneName || result.zoneName || "未知"}。自動狩獵維持停止。`);
  } catch (error) {
    log(`完成移動失敗或結果未確認：${error.message || error}`);
    warn("完成移動結果未確認。請先重新讀取角色與狩獵狀態，不要直接重複送出。");
  }
}
function pct(current, max) { return max > 0 ? (current / max) * 100 : 0; }
function needsRest(c) { return heroes.some((h) => h.perished || pct(h.hp,h.fullHp) < c.hp || pct(h.sp,h.fullSp) < c.sp); }
function stage() { return heroes[0]?.huntStage; }
function schedule(ms) { clearTimeout(timer); nextWakeAt = Date.now() + Math.max(1000, ms); timer = setTimeout(turn, Math.max(1000, ms)); }
function warn(message) { $("alert").textContent = message; $("alert").hidden = false; document.title = `⚠ ${message} | Autoy`; }
function stop(reason = "已停止") { running = false; clearTimeout(timer); clearInterval(watchdog); requestAborter?.abort(); timer = watchdog = requestAborter = null; nextWakeAt = 0; setState(reason); if (reason !== "已停止") warn(reason); }
async function rest(c, accountId = activeId) {
  const restingHeroes = heroes.filter((hero) => Number(hero.actionState) === 2);
  if (restingHeroes.length) {
    if (restingHeroes.length !== heroes.length) throw new Error("隊伍休息狀態不一致；為避免只有部分角色行動，已停止，請重新讀取檢查");
    const completionAt = Math.max(...restingHeroes.map((hero) => {
      const serverEnd = Date.parse(hero.actionCompleteTime || 0) || Date.now();
      const startedAt = Date.parse(hero.actionStart || 0);
      const configuredEnd = Number.isFinite(startedAt) ? startedAt + c.restMinutes * 60000 : 0;
      return Math.max(serverEnd, configuredEnd);
    }));
    const waitMs = completionAt - Date.now();
    if (waitMs > 0 || !restingHeroes.every((hero) => hero.canComplete === true)) {
      const fallbackWait = waitMs > 0 ? waitMs + 2000 : 30000;
      restUntil = Date.now() + fallbackWait;
      log(`偵測到既有休息；等待至 ${new Date(completionAt).toLocaleTimeString()} 後重新讀取`);
      return schedule(fallbackWait);
    }
    const result = await request("/heroes/restAll/complete", { method:"POST" }, accountId);
    if (!running || activeId !== accountId) return;
    heroes = result.huntInfo?.heroes || heroes;
    canForward = result.huntInfo?.canForward ?? canForward;
    restUntil = 0;
    renderHeroes();
    log("已完成啟動前正在進行的全隊休息；將依 HP／SP 門檻決定下一步");
    return schedule(1000);
  }
  if (heroes.some((hero) => Number(hero.actionState) !== 0)) throw new Error("隊伍有尚未完成的行動；已停止狩獵，請先完成該行動");
  const result = await request("/heroes/restAll", { method:"POST" }, accountId); if (!running || activeId !== accountId) return; heroes = result.heroes || heroes; canForward = result.canForward ?? canForward;
  const serverUntil = Math.max(...heroes.map((h) => Date.parse(h.actionCompleteTime || 0)), Date.now());
  restUntil = Math.max(serverUntil, Date.now() + c.restMinutes * 60000); renderHeroes(); log("全部休息，等待完成"); schedule(restUntil - Date.now());
}
async function hunt(c, accountId = activeId) {
  if (Date.now() < cooldownAt) return schedule(cooldownAt - Date.now());
  if (!heroes.length || heroes.some((hero) => Number(hero.actionState) !== 0 || hero.perished === true || Number(hero.hp) <= 0)) throw new Error("隊伍尚未全員空閒且存活；禁止開始狩獵");
  const current = stage(); if (!Number.isInteger(current)) throw new Error("找不到目前樓層");
  if (current > c.target) throw new Error("目前樓層已超過目標，未啟用自動後退");
  const forward = current < c.target;
  if (forward && canForward !== true) throw new Error("尚未確認可前行；請先讓隊伍完成一次休息並重新讀取狀態");
  const result = await request(forward ? "/hunt?type=forward" : "/hunt", { method:"POST" }, accountId); if (!running || activeId !== accountId) return;
  heroes = result.huntInfo?.heroes || heroes; canForward = result.huntInfo?.canForward ?? canForward; cooldownAt = Date.parse(result.huntInfo?.huntAvailableAt || 0); renderHeroes(); log(forward ? "前行完成" : "原地狩獵完成"); schedule(Math.max(1000, cooldownAt - Date.now()));
}
async function turn() {
  if (!running) return;
  const turnAccountId = activeId;
  nextWakeAt = Date.now();
  try { const c = config(); if (!validConfig(c)) throw new Error("請檢查自動狩獵設定"); await refreshAccount(turnAccountId); if (!running || activeId !== turnAccountId) return; if (stopForDeaths()) return; if (!heroes.length) throw new Error("API 沒有回傳角色，已停止以避免空隊伍行動"); if (heroes.some((hero) => typeof hero.hp !== "number" || typeof hero.sp !== "number" || typeof hero.fullHp !== "number" || hero.fullHp <= 0 || typeof hero.fullSp !== "number" || hero.fullSp <= 0 || typeof hero.perished !== "boolean" || !Number.isInteger(hero.actionState))) throw new Error("角色 HP／SP 上限或行動狀態資料無效，已停止自動化"); if (heroes.some((hero) => Number(hero.actionState) === 2)) { await rest(c, turnAccountId); return; } if (heroes.some((hero) => Number(hero.actionState) !== 0)) throw new Error("隊伍存在移動或未識別行動；已停止狩獵，請先完成並重新讀取"); if (needsRest(c)) await rest(c, turnAccountId); else await hunt(c, turnAccountId); } catch (error) { if (error.name !== "AbortError") log(error.message || String(error)); if (activeId === turnAccountId) stop("已因錯誤停止"); }
}
$("account-form").onsubmit = (event) => { event.preventDefault(); if (accountActionId) { log("目前帳號操作尚未完成，請稍後再新增"); return; } const label = $("account-label").value.trim(); const token = $("account-token").value.trim().replace(/^Bearer\s+/i, ""); if (!label || !token) return; if (running) stop(); const account = { id: crypto.randomUUID(), label, token, settings: { target: 1, hp: 80, sp: 70, restMinutes: 1, alertMinutes: 3 } }; accounts.push(account); activeId = account.id; heroes = []; clearRecoveryTimers(); cooldownAt = 0; restUntil = 0; canForward = null; save(); event.target.reset(); loadSettings(account); render(); log("已新增帳號；請重新讀取驗證 token"); refreshAccount().catch((error) => log(`讀取帳號資料失敗：${error.message || error}`)); };
$("refresh").onclick = () => refresh().then(() => { if (!stopForDeaths()) { $("alert").hidden = true; log("目前沒有死亡角色"); } }).catch((e) => log(e.message));
$("start").onclick = () => { if (!active()) return; $("alert").hidden = true; document.title = "Autoy"; running = true; cooldownAt = 0; restUntil = 0; setState(); watchdog = setInterval(() => { const c = config(); if (running && nextWakeAt && Date.now() > nextWakeAt + c.alertMinutes * 60000) { log("超過無動作提醒時間"); stop("超過無動作提醒時間，已停止"); } }, 30000); turn(); };
$("stop").onclick = () => stop();
if (active()) loadSettings();
for (const id of ["target-stage", "hp-target", "sp-target", "rest-minutes", "alert-minutes"]) $(id).addEventListener("change", persistSettings);
render();
if (active()) refreshAccount().catch((error) => log(`讀取帳號資料失敗：${error.message || error}`));
