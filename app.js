const API = "https://myteam.swordgale.online/api";
const storeKey = "autoy.accounts.v1";
let accounts = JSON.parse(localStorage.getItem(storeKey) || "[]");
let activeId = accounts[0]?.id || null;
const runtimes = new Map();
const $ = (id) => document.getElementById(id);
const safe = (text) => String(text).replace(/[<>&]/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;"})[c]);
const active = () => accounts.find((a) => a.id === activeId);
function runtimeFor(id = activeId) {
  if (!runtimes.has(id)) runtimes.set(id, { heroes: [], messages: [], operations: [], timer: null, refreshPromise: null, running: false, cooldownAt: 0, restUntil: 0, canForward: null, nextWakeAt: 0, watchdog: null, aborters: new Set(), writeBusy: false, actionBusy: false, recoveryRequests: new Set(), recoveryTimers: new Map(), deathMovePhase: null, deathRecoveryPhase: false, resumeDeathMoveAfterRecovery: false });
  return runtimes.get(id);
}
for (const account of accounts) runtimeFor(account.id);
function save() { localStorage.setItem(storeKey, JSON.stringify(accounts)); }
function log(message, accountId = activeId) {
  const label = accounts.find((a) => a.id === accountId)?.label;
  const prefix = label ? `[${label}] ` : "";
  const state = runtimeFor(accountId);
  state.messages.unshift({ time: new Date().toLocaleTimeString(), text: `${prefix}${message}` });
  state.messages.splice(160);
  operation(accountId, "flow.message", { message });
  if (accountId === activeId) renderFlowMessages(accountId);
}
function operation(accountId, event, details = {}) {
  const account = accounts.find((entry) => entry.id === accountId);
  if (account?.settings?.operationLog !== true) return;
  const state = runtimeFor(accountId);
  const safeDetails = { ...details };
  if (typeof safeDetails.message === "string") safeDetails.message = safeDetails.message.replace(/API (\d+):[\s\S]*/, "API $1").slice(0, 500);
  state.operations.unshift({ at: new Date().toISOString(), event, ...safeDetails });
  state.operations.splice(500);
  if (accountId === activeId) renderOperations(accountId);
}
function safeOperationPayload(value, depth = 0) {
  if (depth > 8) return "[內容層級過深，已截斷]";
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return typeof value === "string" && value.length > 16000 ? `${value.slice(0, 16000)}…[已截斷]` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeOperationPayload(item, depth + 1));
  if (typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 100)) result[key] = /token|authorization|cookie|password|secret|api[_-]?key/i.test(key) ? "[已遮罩]" : safeOperationPayload(item, depth + 1);
    return result;
  }
  return String(value);
}
function operationRequestBody(body) {
  if (body === undefined || body === null || body === "") return null;
  if (typeof body === "string") {
    try { return safeOperationPayload(JSON.parse(body)); }
    catch { return safeOperationPayload(body); }
  }
  return safeOperationPayload(body);
}
function renderOperations(accountId = activeId) {
  const account = accounts.find((entry) => entry.id === accountId);
  const state = runtimeFor(accountId);
  $("operation-card").hidden = !account || account.settings?.operationLog !== true;
  if (!account || account.settings?.operationLog !== true) return;
  $("operations").textContent = state.operations.length ? JSON.stringify(state.operations, null, 2) : "尚未記錄操作。啟用後的下一個讀取或自動流程會出現在此處。";
}
function renderFlowMessages(accountId = activeId) {
  const account = accounts.find((entry) => entry.id === accountId);
  const state = runtimeFor(accountId);
  $("flow-card").hidden = !account || account.settings?.flowMessages === false;
  if (!account || account.settings?.flowMessages === false) return;
  $("events").textContent = state.messages.map((entry) => `[${entry.time}] ${entry.text}`).join("\n") || "尚無流程訊息。";
}
function debug(accountId, event, details = {}) {
  const account = accounts.find((entry) => entry.id === accountId);
  if (account?.settings?.debug !== true) return;
  console.debug("[Autoy debug]", {
    at: new Date().toISOString(),
    account: account.label,
    event,
    ...details
  });
}
function partyDebug(party) {
  return party.map((hero) => ({ id: hero.id, name: hero.name, selected: hero.selected, hp: hero.hp, fullHp: hero.fullHp, sp: hero.sp, fullSp: hero.fullSp, actionState: hero.actionState, perished: hero.perished, zone: hero.huntZone, stage: hero.huntStage, canComplete: hero.canComplete }));
}
function config(accountId = activeId) {
  const account = accounts.find((a) => a.id === accountId);
  if (account?.settings) return { target: Number(account.settings.target), hp: Number(account.settings.hp), sp: Number(account.settings.sp), restMinutes: Number(account.settings.restMinutes), alertMinutes: Number(account.settings.alertMinutes), flowMessages: account.settings.flowMessages !== false, operationLog: account.settings.operationLog === true, debug: account.settings.debug === true };
  return { target: Number($("target-stage").value), hp: Number($("hp-target").value), sp: Number($("sp-target").value), restMinutes: Number($("rest-minutes").value), alertMinutes: Number($("alert-minutes").value), flowMessages: $("flow-messages").checked, operationLog: $("operation-log").checked, debug: $("debug-console").checked };
}
function validConfig(c) { return Number.isInteger(c.target) && c.target > 0 && c.hp >= 1 && c.hp <= 100 && c.sp >= 1 && c.sp <= 100 && c.restMinutes > 0 && c.alertMinutes >= 1; }
function defaultSettings() { return { target: 1, hp: 80, sp: 70, restMinutes: 1, alertMinutes: 3, flowMessages: true, operationLog: false, debug: false }; }
function loadSettings(account = active()) {
  if (!account) return;
  account.settings = { ...defaultSettings(), ...(account.settings || {}) };
  $("target-stage").value = account.settings.target;
  $("hp-target").value = account.settings.hp;
  $("sp-target").value = account.settings.sp;
  $("rest-minutes").value = account.settings.restMinutes;
  $("alert-minutes").value = account.settings.alertMinutes;
  $("flow-messages").checked = account.settings.flowMessages !== false;
  $("operation-log").checked = account.settings.operationLog === true;
  $("debug-console").checked = account.settings.debug === true;
}
function persistSettings() {
  const account = active();
  if (!account) return;
  account.settings = configFromForm();
  save();
}
function configFromForm() { return { target: Number($("target-stage").value), hp: Number($("hp-target").value), sp: Number($("sp-target").value), restMinutes: Number($("rest-minutes").value), alertMinutes: Number($("alert-minutes").value), flowMessages: $("flow-messages").checked, operationLog: $("operation-log").checked, debug: $("debug-console").checked }; }
function clearRecoveryTimers(accountId) {
  const state = runtimeFor(accountId);
  for (const entry of state.recoveryTimers.values()) clearTimeout(entry.timer);
  state.recoveryTimers.clear();
}
function mergeHeroes(current, updates) {
  const updateMap = new Map((updates || []).map((hero) => [String(hero.id), hero]));
  const merged = current.map((hero) => updateMap.has(String(hero.id)) ? { ...hero, ...updateMap.get(String(hero.id)) } : hero);
  const known = new Set(current.map((hero) => String(hero.id)));
  for (const hero of updates || []) if (!known.has(String(hero.id))) merged.push(hero);
  return merged;
}
function selectedParty(accountId, requireLimit = true) {
  const state = runtimeFor(accountId);
  if (!state.heroes.length) throw new Error("API 沒有回傳角色，禁止空隊伍狩獵");
  if (state.heroes.some((hero) => typeof hero.selected !== "boolean")) throw new Error("角色出戰勾選狀態不明；請重新讀取角色頁後再啟動");
  const party = state.heroes.filter((hero) => hero.selected === true);
  if (!party.length) throw new Error("目前沒有勾選出戰的角色");
  if (requireLimit && party.length > 4) throw new Error(`目前勾選 ${party.length} 名出戰角色，最多只能出戰 4 名；未送出狩獵請求`);
  return party;
}
async function request(path, options = {}, accountId = activeId) {
  const account = accounts.find((entry) => entry.id === accountId);
  if (!account) throw new Error("請先選擇帳號");
  const state = runtimeFor(accountId);
  const method = (options.method || "GET").toUpperCase();
  const isWrite = method !== "GET" && method !== "HEAD";
  if (isWrite && state.writeBusy) throw new Error("此帳號已有行動請求處理中，避免重複送出");
  if (isWrite) state.writeBusy = true;
  const controller = new AbortController();
  state.aborters.add(controller);
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const requestBody = operationRequestBody(options.body);
  try {
    operation(accountId, "api.request", { requestId, method, path, requestBody });
    debug(accountId, "api.request", { method, path });
    const response = await fetch(`${API}${path}`, { ...options, signal: controller.signal, headers: { token: account.token, ...(options.headers || {}) } });
    if (!response.ok) {
      const errorText = await response.text();
      operation(accountId, "api.failure", { requestId, method, path, requestBody, status: response.status, durationMs: Date.now() - startedAt, responseBody: operationRequestBody(errorText) });
      debug(accountId, "api.error", { method, path, status: response.status, response: errorText });
      throw new Error(`API ${response.status}: ${errorText}`);
    }
    const rotatedToken = response.headers.get("token");
    if (rotatedToken && rotatedToken !== account.token) { account.token = rotatedToken.replace(/^Bearer\s+/i, ""); save(); renderAccounts(); log("已更新 API token", accountId); }
    const data = await response.json();
    operation(accountId, "api.success", { requestId, method, path, requestBody, status: response.status, durationMs: Date.now() - startedAt, responseBody: safeOperationPayload(data) });
    debug(accountId, "api.success", { method, path, status: response.status });
    return data;
  } catch (error) {
    if (error.name !== "AbortError") operation(accountId, "api.exception", { requestId, method, path, requestBody, durationMs: Date.now() - startedAt, message: String(error.message || error).slice(0, 500) });
    if (error.name !== "AbortError") debug(accountId, "api.exception", { method, path, message: error.message || String(error) });
    throw error;
  } finally {
    state.aborters.delete(controller);
    if (isWrite) state.writeBusy = false;
  }
}
async function refresh(accountId = activeId) {
  const state = runtimeFor(accountId);
  const data = await request("/heroes", {}, accountId);
  state.heroes = data.heroes || [];
  if (accountId === activeId) { renderHeroes(accountId); log(`已讀取 ${state.heroes.length} 張角色卡`, accountId); }
  return state.heroes;
}
async function refreshAccount(accountId = activeId, { quiet = false } = {}) {
  const state = runtimeFor(accountId);
  if (state.refreshPromise) return state.refreshPromise;
  state.refreshPromise = (async () => {
    const heroData = await request("/heroes", {}, accountId);
    const huntInfo = await request("/huntInfo", {}, accountId);
    state.heroes = heroData.heroes || [];
    state.canForward = huntInfo.canForward ?? null;
    state.cooldownAt = Date.parse(huntInfo.huntAvailableAt || 0) || 0;
    debug(accountId, "state.refreshed", { party: partyDebug(state.heroes.filter((hero) => hero.selected === true)), huntZone: huntInfo.huntZone, huntStage: huntInfo.huntStage, canForward: state.canForward, cooldownAt: huntInfo.huntAvailableAt || null });
    if (accountId === activeId) {
      renderHeroes(accountId);
      const count = state.heroes.filter((hero) => hero.selected === true).length;
      if (!quiet) log(`已載入帳號狀態：${state.heroes.length} 張角色卡，勾選出戰 ${count} 名；${huntInfo.zoneName || "位置未知"} ${huntInfo.huntStage ?? "?"} 層`, accountId);
    }
  })();
  try { return await state.refreshPromise; }
  finally { state.refreshPromise = null; }
}
function renderAccounts() {
  $("accounts").innerHTML = accounts.map((account) => {
    const state = runtimeFor(account.id);
    return `<div class="account ${account.id === activeId ? "active" : ""}"><button data-select="${account.id}">${safe(account.label)}</button><small>${state.running ? "自動狩獵中" : "已停止"} · token 已設定</small><button data-run="${account.id}" class="${state.running ? "danger" : "primary"}">${state.running ? "停止此帳號" : "啟動此帳號"}</button><button data-delete="${account.id}">移除</button></div>`;
  }).join("");
  document.querySelectorAll("[data-select]").forEach((button) => button.onclick = () => {
    activeId = button.dataset.select;
    loadSettings(active());
    render();
    refreshAccount(activeId).catch((error) => log(`讀取帳號資料失敗：${error.message || error}`, activeId));
  });
  document.querySelectorAll("[data-run]").forEach((button) => button.onclick = () => {
    const id = button.dataset.run;
    runtimeFor(id).running ? stopRunner(id) : startRunner(id);
  });
  document.querySelectorAll("[data-delete]").forEach((button) => button.onclick = () => {
    const id = button.dataset.delete;
    stopRunner(id, "帳號已移除");
    clearRecoveryTimers(id);
    accounts = accounts.filter((account) => account.id !== id);
    runtimes.delete(id);
    if (activeId === id) { activeId = accounts[0]?.id || null; if (active()) loadSettings(); }
    save(); render();
    if (active()) refreshAccount(activeId).catch((error) => log(`讀取帳號資料失敗：${error.message || error}`, activeId));
  });
}
function renderHeroes(accountId = activeId) {
  const state = runtimeFor(accountId);
  if (accountId !== activeId) return;
  $("heroes").innerHTML = state.heroes.map((hero) => {
    const recovery = deathState(hero);
    const reviving = recovery === "death" && Number(hero.actionState) === 3;
    const moving = Number(hero.actionState) === 1;
    const resting = Number(hero.actionState) === 2;
    const status = recovery === "final-death" ? "死透了：需要轉生後復活" : reviving ? `重生中，完成時間 ${formatTime(hero.actionCompleteTime)}` : recovery === "death" ? "死亡：需要重生／復活" : moving ? `移動中，完成時間 ${formatTime(hero.actionCompleteTime)}` : resting ? `休息中，完成時間 ${formatTime(hero.actionCompleteTime)}${hero.canComplete === true ? "（可完成）" : ""}` : Number(hero.actionState) === 0 ? "空閒" : `狀態 ${hero.actionState}`;
    const duty = hero.selected === true ? "出戰" : hero.selected === false ? "未勾選出戰" : "出戰狀態未知";
    const recoveryLink = recovery ? `<a class="recovery-link" href="https://myteam.swordgale.online/heroes/${encodeURIComponent(hero.id)}" target="_blank" rel="noopener noreferrer">前往遊戲手動復原</a>` : "";
    return `<article class="hero ${recovery ? "hero-dead" : ""}"><strong>${safe(hero.name)}</strong><p>${duty} · 樓層 ${hero.huntStage ?? "-"} · ${safe(hero.zoneName || "-")}</p><p>HP ${hero.hp}/${hero.fullHp} · SP ${hero.sp}/${hero.fullSp}</p><p>${status}</p>${recoveryLink}</article>`;
  }).join("");
  const party = state.heroes.filter((hero) => hero.selected === true);
  const deaths = party.filter((hero) => deathState(hero) === "death");
  const finalDeaths = party.filter((hero) => deathState(hero) === "final-death");
  const accountDeaths = state.heroes.filter((hero) => deathState(hero) === "death");
  for (const hero of party) scheduleObservedAction(hero, accountId);
  const readyToComplete = deaths.length > 0 && accountDeaths.every((hero) => Number(hero.actionState) === 3 && hero.canComplete === true);
  const canStartRevive = deaths.length > 0 && accountDeaths.every((hero) => Number(hero.actionState) === 0);
  const canCompleteMove = party.some((hero) => Number(hero.actionState) === 1 && hero.canComplete === true);
  const controls = [];
  if (!state.running && (deaths.length || finalDeaths.length)) controls.push('<button id="return-start" class="primary">回程／返回起點</button>');
  if (!state.running && canCompleteMove) controls.push('<button id="complete-move">完成移動</button>');
  if (!state.running && canStartRevive) controls.push('<button id="revive-all" class="primary">全部重生</button>');
  if (!state.running && readyToComplete) controls.push('<button id="complete-revive-all" class="primary">完成全部重生</button>');
  if (!state.running) for (const hero of finalDeaths) controls.push(`<button data-reincarnate="${encodeURIComponent(hero.id)}" class="danger" ${state.recoveryRequests.has(String(hero.id)) ? "disabled" : ""}>單獨轉生 ${safe(hero.name)}</button>`);
  if (!state.running && finalDeaths.length) controls.push('<a class="recovery-link" href="https://myteam.swordgale.online/heroes" target="_blank" rel="noopener noreferrer">前往遊戲角色頁</a>');
  $("death-actions").innerHTML = deaths.length || finalDeaths.length
    ? `<div class="recovery-actions"><strong>出戰隊伍復原</strong><p>${state.running ? "自動狩獵執行中：會自動回城，對帳號內所有一般死亡角色批次重生，並對出戰死透角色逐角轉生；復原後檢查 HP／SP 並繼續狩獵。" : "狩獵與死透轉生依勾選出戰角色；一般死亡依你的設定，對帳號內所有一般死亡角色執行批次重生。"}</p><div class="actions">${controls.join("")}</div></div>`
    : "";
  const reviveButton = $("revive-all"); if (reviveButton) reviveButton.onclick = () => runManual(accountId, startReviveAll);
  const completeReviveButton = $("complete-revive-all"); if (completeReviveButton) completeReviveButton.onclick = () => runManual(accountId, completeReviveAll);
  const returnButton = $("return-start"); if (returnButton) returnButton.onclick = () => runManual(accountId, returnToStart);
  const moveButton = $("complete-move"); if (moveButton) moveButton.onclick = () => runManual(accountId, completeMovement);
  document.querySelectorAll("[data-reincarnate]").forEach((button) => button.onclick = () => runManual(accountId, () => reincarnateHero(button.dataset.reincarnate)));
  const selectedCount = state.heroes.filter((hero) => hero.selected === true).length;
  $("party-summary").textContent = `${selectedCount} 名勾選出戰／最多 4 名`;
  if (accounts.some((account) => runtimeFor(account.id).running)) {
    const activeState = runtimeFor(accountId);
    setState(activeState.running ? null : "目前帳號已停止；其他帳號仍在自動狩獵", accountId);
  }
}
function scheduleObservedAction(hero, accountId) {
  const state = runtimeFor(accountId);
  if (state.running && (state.deathMovePhase || state.deathRecoveryPhase)) return;
  const waitingForRecovery = deathState(hero) === "death" && Number(hero.actionState) === 3;
  const waitingForMove = Number(hero.actionState) === 1;
  const key = String(hero.id);
  const existing = state.recoveryTimers.get(key);
  if ((!waitingForRecovery && !waitingForMove) || hero.canComplete === true || !hero.actionCompleteTime) {
    if (existing && (!waitingForRecovery && !waitingForMove || hero.canComplete === true)) { clearTimeout(existing.timer); state.recoveryTimers.delete(key); }
    return;
  }
  const dueAt = Date.parse(hero.actionCompleteTime);
  if (!Number.isFinite(dueAt) || existing?.dueAt === dueAt) return;
  if (existing) clearTimeout(existing.timer);
  const delay = Math.max(1000, dueAt - Date.now() + 2000, dueAt <= Date.now() ? 30000 : 0);
  const timer = setTimeout(async () => {
    state.recoveryTimers.delete(key);
    try { await refresh(accountId); stopForDeaths(accountId); log(`${hero.name} 行動預定時間已到；已重新讀取狀態`, accountId); }
    catch (error) { log(`${hero.name} 行動狀態讀取失敗，請手動重新讀取：${error.message || error}`, accountId); }
  }, delay);
  state.recoveryTimers.set(key, { dueAt, timer });
}
function formatTime(value) { const time = Date.parse(value || ""); return Number.isFinite(time) ? new Date(time).toLocaleString() : "等待伺服器狀態"; }
function render() {
  renderAccounts();
  const account = active();
  $("automation-card").hidden = !account;
  $("hero-panel").hidden = !account;
  if (account) { $("active-label").textContent = account.label; loadSettings(account); renderHeroes(account.id); renderFlowMessages(account.id); renderOperations(account.id); setState(null, account.id); }
  else { $("heroes").innerHTML = ""; $("death-actions").innerHTML = ""; $("party-summary").textContent = ""; $("flow-card").hidden = true; $("operation-card").hidden = true; }
}
function setState(message, accountId = activeId) {
  if (accountId !== activeId) return;
  const state = runtimeFor(accountId);
  const el = $("run-state");
  el.textContent = message || (state.running ? "運行中" : "已停止");
  el.classList.toggle("running", state.running);
}
function deathState(hero) { if (hero.perished === true) return "final-death"; if (Number(hero.hp) <= 0 && hero.perished === false) return "death"; return null; }
function stopForDeaths(accountId) {
  const state = runtimeFor(accountId);
  let party;
  try { party = selectedParty(accountId); } catch (error) { stopRunner(accountId, error.message); return true; }
  const dead = party.filter((hero) => deathState(hero));
  if (!dead.length) return false;
  const summary = dead.map((hero) => deathState(hero) === "final-death" ? `${hero.name}：死透了，需個別轉生` : Number(hero.actionState) === 3 ? `${hero.name}：重生行動進行中` : `${hero.name}：死亡，需重生`).join("；");
  if (state.running) {
    log(`偵測到出戰角色死亡：${summary}；自動暫停狩獵並開始回程／復原`, accountId);
    schedule(1000, accountId);
  } else {
    warn(`自動狩獵未執行。${summary}。`, accountId);
  }
  renderHeroes(accountId);
  return true;
}
function scheduleDeathMove(accountId, party, reason) {
  const state = runtimeFor(accountId);
  const endAt = Math.max(...party.filter((hero) => Number(hero.actionState) === 1).map((hero) => Date.parse(hero.actionCompleteTime || 0) || Date.now()), 0);
  const wait = Math.max(1000, endAt - Date.now() + 1500);
  log(`${reason}；等待移動完成後重新檢查，約 ${Math.ceil(wait / 1000)} 秒`, accountId);
  schedule(wait, accountId);
}
function scheduleDeathRecovery(accountId, heroes, reason) {
  const dueAt = Math.max(...heroes.map((hero) => Date.parse(hero.actionCompleteTime || 0) || 0), 0);
  const wait = dueAt > Date.now() ? dueAt - Date.now() + 2000 : 30000;
  log(`${reason}；依伺服器完成時間等待約 ${Math.ceil(wait / 1000)} 秒後重查`, accountId);
  schedule(wait, accountId);
}
async function continueDeathRecovery(accountId) {
  const state = runtimeFor(accountId);
  let party = selectedParty(accountId);
  const finalDeaths = party.filter((hero) => deathState(hero) === "final-death");
  for (const hero of finalDeaths) {
    state.recoveryRequests.add(String(hero.id));
    if (accountId === activeId) renderHeroes(accountId);
    try {
      await request(`/heroes/${encodeURIComponent(hero.id)}/reincarnate`, { method: "POST" }, accountId);
      await refreshAccount(accountId);
      party = selectedParty(accountId);
      const current = party.find((entry) => String(entry.id) === String(hero.id));
      if (!current || deathState(current) === "final-death") throw new Error(`${hero.name} 轉生請求已送出，但最新角色狀態尚未確認復原；為避免重複轉生，已停止`);
      log(`${hero.name} 已完成轉生，繼續檢查其他出戰角色`, accountId);
    } finally {
      state.recoveryRequests.delete(String(hero.id));
      if (accountId === activeId) renderHeroes(accountId);
    }
  }

  party = selectedParty(accountId);
  const ordinaryDeaths = party.filter((hero) => deathState(hero) === "death");
  if (ordinaryDeaths.length) {
    const accountDeaths = state.heroes.filter((hero) => deathState(hero) === "death");
    const reviving = accountDeaths.filter((hero) => Number(hero.actionState) === 3);
    if (reviving.length && reviving.length !== accountDeaths.length) throw new Error("帳號內死亡角色重生狀態不一致；不重複送出全部重生，請重新檢查角色");
    if (reviving.length) {
      if (!accountDeaths.every((hero) => Number(hero.actionState) === 3)) throw new Error("帳號內死亡角色重生狀態不一致；不呼叫批次完成端點，請重新檢查角色");
      if (!accountDeaths.every((hero) => hero.canComplete === true)) {
        scheduleDeathRecovery(accountId, accountDeaths, "一般死亡角色正在重生");
        return true;
      }
      const result = await request("/heroes/reviveAll/complete", { method: "POST" }, accountId);
      state.heroes = mergeHeroes(state.heroes, result.heroes);
      await refreshAccount(accountId);
      const stillDead = selectedParty(accountId).filter((hero) => deathState(hero) === "death");
      if (stillDead.length) throw new Error(`批次完成重生後仍有 ${stillDead.length} 名出戰角色死亡；停止以避免重複完成`);
      log(`已完成全部重生（${ordinaryDeaths.length} 名出戰角色），重新檢查 HP／SP`, accountId);
    } else {
      if (accountDeaths.some((hero) => Number(hero.actionState) !== 0)) throw new Error("帳號內一般死亡角色有無法辨識的行動狀態；停止自動重生");
      await request("/heroes/reviveAll", { method: "POST" }, accountId);
      await refreshAccount(accountId);
      const started = state.heroes.filter((hero) => deathState(hero) === "death");
      if (!started.length) {
        log("全部重生請求後，出戰角色已不再是死亡狀態", accountId);
        schedule(1000, accountId);
        return true;
      }
      if (started.some((hero) => Number(hero.actionState) !== 3)) throw new Error("全部重生已送出，但 API 未確認所有一般死亡角色進入重生；停止自動化以免重複送出");
      if (started.every((hero) => hero.canComplete === true)) schedule(1000, accountId);
      else scheduleDeathRecovery(accountId, started, "已自動開始全部重生");
      return true;
    }
  }

  party = selectedParty(accountId);
  const remainingDeaths = party.filter((hero) => deathState(hero));
  if (remainingDeaths.length) {
    schedule(1000, accountId);
    return true;
  }
  state.deathRecoveryPhase = false;
  log("勾選出戰角色已全部復原；重新檢查 HP／SP 後繼續自動狩獵", accountId);
  if (state.resumeDeathMoveAfterRecovery) {
    state.resumeDeathMoveAfterRecovery = false;
    state.deathMovePhase = "to-town";
    log("偵測到既有重生流程先完成；接著繼續死亡回程流程", accountId);
  }
  schedule(1000, accountId);
  return true;
}
async function beginDeathMove(accountId, destination, phaseLabel) {
  const state = runtimeFor(accountId);
  const result = await request(`/move/${destination}`, { method: "POST" }, accountId);
  state.heroes = mergeHeroes(state.heroes, result.heroes);
  state.deathMovePhase = destination === 0 ? "to-town" : "to-grassland";
  await refreshAccount(accountId);
  log(`死亡復原流程：已開始${phaseLabel}移動`, accountId);
}
async function continueDeathMove(accountId, party) {
  const state = runtimeFor(accountId);
  if (!state.deathMovePhase) {
    const inProgressRevivals = party.filter((hero) => deathState(hero) === "death" && Number(hero.actionState) === 3);
    if (inProgressRevivals.length) {
      state.deathRecoveryPhase = true;
      state.resumeDeathMoveAfterRecovery = true;
      return continueDeathRecovery(accountId);
    }
    const alreadyMoving = party.every((hero) => Number(hero.actionState) === 1);
    const alreadyAtTown = party.every((hero) => Number(hero.huntZone) === 0 && Number(hero.huntStage) === 0);
    if (alreadyMoving) state.deathMovePhase = "to-town";
    else if (alreadyAtTown) {
      if (party.some((hero) => Number(hero.actionState) !== 0)) throw new Error("出戰角色目前有休息、重生或其他行動；完成後再重新啟動死亡復原流程");
      state.deathMovePhase = "to-town";
      await beginDeathMove(accountId, 1, "前往大草原");
      scheduleDeathMove(accountId, selectedParty(accountId), "已送出前往大草原");
      return true;
    }
    else {
      if (party.some((hero) => Number(hero.actionState) !== 0)) throw new Error("出戰角色目前有休息、重生或其他行動；請先完成該行動，再重新啟動死亡回城流程");
      state.deathMovePhase = "to-town";
      await beginDeathMove(accountId, 0, "返回城鎮");
      scheduleDeathMove(accountId, selectedParty(accountId), "已送出返回城鎮");
      return true;
    }
  }
  const moving = party.filter((hero) => Number(hero.actionState) === 1);
  if (moving.length) {
    if (moving.length !== party.length) throw new Error("出戰角色移動狀態不一致；已停止自動移動，請檢查遊戲狀態");
    if (!moving.every((hero) => hero.canComplete === true)) {
      scheduleDeathMove(accountId, moving, "出戰角色仍在移動");
      return true;
    }
    const result = await request("/move/complete", { method: "POST" }, accountId);
    state.heroes = mergeHeroes(state.heroes, result.heroes);
    await refreshAccount(accountId);
    const info = await request("/huntInfo", {}, accountId);
    state.canForward = info.canForward ?? result.canForward ?? state.canForward;
    if (state.deathMovePhase === "to-town") {
      if (Number(info.huntZone) === 1 && Number(info.huntStage) === 1) {
        state.deathMovePhase = null;
        state.deathRecoveryPhase = true;
        log("回程完成後已在大草原第 1 層；開始自動重生／轉生", accountId);
        return continueDeathRecovery(accountId);
      }
      if (Number(info.huntZone) !== 0 || Number(info.huntStage) !== 0) throw new Error(`返回移動完成後位置不是城鎮（目前 ${info.zoneName || "未知"} ${info.huntZone}/${info.huntStage}）；為避免走錯地圖，已停止自動流程`);
      log("死亡復原流程：已抵達城鎮，開始前往大草原", accountId);
      await beginDeathMove(accountId, 1, "前往大草原");
      scheduleDeathMove(accountId, selectedParty(accountId), "已送出前往大草原");
      return true;
    }
    if (Number(info.huntZone) !== 1 || Number(info.huntStage) !== 1) throw new Error(`前往大草原後位置不符（目前 ${info.zoneName || "未知"} ${info.huntZone}/${info.huntStage}）；已停止自動流程`);
    state.deathMovePhase = null;
    state.deathRecoveryPhase = true;
    log("已抵達大草原第 1 層；開始自動重生／轉生", accountId);
    return continueDeathRecovery(accountId);
  }
  if (state.deathMovePhase === "to-town" && party.every((hero) => Number(hero.huntZone) === 0 && Number(hero.huntStage) === 0)) {
    await beginDeathMove(accountId, 1, "前往大草原");
    scheduleDeathMove(accountId, selectedParty(accountId), "已送出前往大草原");
    return true;
  }
  if (state.deathMovePhase === "to-grassland" && party.every((hero) => Number(hero.huntZone) === 1 && Number(hero.huntStage) === 1)) {
    state.deathMovePhase = null;
    state.deathRecoveryPhase = true;
    return continueDeathRecovery(accountId);
  }
  if (party.every((hero) => Number(hero.actionState) === 0)) {
    const destination = state.deathMovePhase === "to-town" ? 0 : 1;
    const label = destination === 0 ? "返回城鎮" : "前往大草原";
    await beginDeathMove(accountId, destination, label);
    scheduleDeathMove(accountId, selectedParty(accountId), `已重新送出${label}`);
    return true;
  }
  throw new Error("死亡回城流程中沒有可辨識的移動狀態；已停止自動流程，請重新讀取並手動確認");
}
function partyVitalsValid(party) {
  return party.every((hero) => typeof hero.hp === "number" && typeof hero.sp === "number" && typeof hero.fullHp === "number" && hero.fullHp > 0 && typeof hero.fullSp === "number" && hero.fullSp > 0 && typeof hero.perished === "boolean" && Number.isInteger(hero.actionState));
}
function pct(current, max) { return max > 0 ? current / max * 100 : 0; }
function needsRest(c, accountId) { return selectedParty(accountId).some((hero) => pct(hero.hp, hero.fullHp) < c.hp || pct(hero.sp, hero.fullSp) < c.sp); }
function schedule(ms, accountId) {
  const state = runtimeFor(accountId);
  clearTimeout(state.timer);
  state.nextWakeAt = Date.now() + Math.max(1000, ms);
  operation(accountId, "runner.scheduled", { delayMs: Math.max(1000, ms), nextWakeAt: new Date(state.nextWakeAt).toISOString() });
  debug(accountId, "runner.scheduled", { delayMs: Math.max(1000, ms), nextWakeAt: new Date(state.nextWakeAt).toISOString() });
  state.timer = setTimeout(() => turn(accountId), Math.max(1000, ms));
}
function warn(message, accountId = activeId) {
  if (accountId === activeId) { $("alert").textContent = message; $("alert").hidden = false; document.title = `⚠ ${message} | Autoy`; }
  log(message, accountId);
}
function stopRunner(accountId, reason = "已停止") {
  const state = runtimeFor(accountId);
  operation(accountId, "runner.stopped", { reason });
  debug(accountId, "runner.stopped", { reason });
  state.running = false;
  clearTimeout(state.timer); clearInterval(state.watchdog);
  for (const controller of state.aborters) controller.abort();
  state.aborters.clear(); state.timer = state.watchdog = null; state.nextWakeAt = 0;
  if (accountId === activeId) setState(reason, accountId);
  renderAccounts();
  if (reason !== "已停止" && reason !== "帳號已移除") warn(reason, accountId);
}
async function runManual(accountId, action) {
  const state = runtimeFor(accountId);
  if (state.actionBusy) return;
  if (state.running) stopRunner(accountId, "執行人工復原操作，已停止此帳號狩獵");
  state.actionBusy = true; renderAccounts();
  try { await action(accountId); }
  finally { state.actionBusy = false; renderAccounts(); }
}
async function startReviveAll(accountId) {
  const state = runtimeFor(accountId);
  const deaths = selectedParty(accountId).filter((hero) => deathState(hero) === "death");
  const accountDeaths = state.heroes.filter((hero) => deathState(hero) === "death");
  if (!deaths.length) return;
  if (accountDeaths.some((hero) => Number(hero.actionState) !== 0)) { warn("帳號內一般死亡角色已有重生或未知行動；請重新讀取，避免重複呼叫全部重生", accountId); return; }
  try { const result = await request("/heroes/reviveAll", { method: "POST" }, accountId); state.heroes = mergeHeroes(state.heroes, result.heroes); renderHeroes(accountId); log("已對可重生角色開始全部重生；死透角色不會由此端點復原", accountId); stopForDeaths(accountId); }
  catch (error) {
    try { await refreshAccount(accountId); } catch { /* Preserve the original write result for the operator. */ }
    warn(`全部重生結果未確認：${error.message || error}；已嘗試重新讀取，請確認狀態後再操作`, accountId);
  }
}
async function completeReviveAll(accountId) {
  const state = runtimeFor(accountId);
  const party = selectedParty(accountId);
  const deaths = party.filter((hero) => deathState(hero) === "death");
  const accountDeaths = state.heroes.filter((hero) => deathState(hero) === "death");
  if (!deaths.length || !accountDeaths.length || !accountDeaths.every((hero) => Number(hero.actionState) === 3 && hero.canComplete === true)) { log("帳號內全部一般死亡角色尚未由 API 確認可完成，請重新讀取", accountId); return; }
  if (!window.confirm(`確定完成帳號內全部重生？目前有 ${accountDeaths.length} 名一般死亡角色。`)) return;
  state.recoveryRequests.add("reviveAll"); renderHeroes(accountId);
  try {
    const result = await request("/heroes/reviveAll/complete", { method: "POST" }, accountId);
    state.heroes = mergeHeroes(state.heroes, result.heroes);
    await refreshAccount(accountId);
    if (selectedParty(accountId).some((hero) => deathState(hero) === "death")) throw new Error("批次完成後仍有出戰角色死亡；請確認最新遊戲狀態，不要重複送出");
    log("已完成全部重生並重新讀取角色狀態", accountId);
  } catch (error) {
    try { await refreshAccount(accountId); } catch { /* Do not repeat an uncertain batch write. */ }
    warn(`全部重生完成結果未確認：${error.message || error}；請重新讀取，不要直接重複送出`, accountId);
  } finally { state.recoveryRequests.delete("reviveAll"); renderHeroes(accountId); }
}
async function reincarnateHero(heroId, accountId) {
  const state = runtimeFor(accountId);
  const hero = selectedParty(accountId).find((entry) => String(entry.id) === String(heroId));
  if (!hero || deathState(hero) !== "final-death") { log("角色目前不是出戰中的死透角色；請重新讀取後再操作", accountId); return; }
  if (!window.confirm(`確定要讓「${hero.name}」單獨轉生嗎？此操作會改變角色狀態。`)) return;
  state.recoveryRequests.add(String(hero.id)); renderHeroes(accountId);
  try { await request(`/heroes/${encodeURIComponent(hero.id)}/reincarnate`, { method: "POST" }, accountId); await refresh(accountId); log(`${hero.name} 已送出單獨轉生並重新讀取角色狀態`, accountId); stopForDeaths(accountId); }
  catch (error) {
    log(`${hero.name} 單獨轉生結果未確認：${error.message || error}`, accountId);
    try { await refresh(accountId); warn(`${hero.name} 狀態已重新讀取；請確認轉生結果，不要直接重複送出`, accountId); }
    catch { warn(`${hero.name} 結果未確認且無法重讀；請稍後再查，不要直接重複送出`, accountId); }
  } finally { state.recoveryRequests.delete(String(hero.id)); renderHeroes(accountId); }
}
async function returnToStart(accountId) {
  const party = selectedParty(accountId);
  const affected = party.filter((hero) => deathState(hero));
  if (!affected.length) { log("目前沒有勾選出戰的死亡角色；請重新讀取", accountId); return; }
  if (!window.confirm(`出戰隊伍有死亡角色：${affected.map((hero) => hero.name).join("、")}。確定執行回程／返回起點嗎？`)) return;
  const state = runtimeFor(accountId);
  try {
    const result = await request("/move/0", { method: "POST" }, accountId);
    state.heroes = mergeHeroes(state.heroes, result.heroes); state.canForward = result.canForward ?? state.canForward;
    await refresh(accountId);
    const info = await request("/huntInfo", {}, accountId);
    state.canForward = info.canForward ?? state.canForward; state.cooldownAt = Date.parse(info.huntAvailableAt || 0) || state.cooldownAt;
    const position = state.heroes.find((hero) => hero.selected)?.zoneName || result.zoneName || "位置未知";
    log(`已執行回程／返回起點；最新區域：${position}`, accountId);
    if (!stopForDeaths(accountId)) warn(`回程完成；位置：${position}。自動狩獵維持停止。`, accountId);
  } catch (error) { warn(`回程結果未確認，請重新讀取後再操作：${error.message || error}`, accountId); }
}
async function completeMovement(accountId) {
  const state = runtimeFor(accountId);
  if (!selectedParty(accountId).some((hero) => Number(hero.actionState) === 1 && hero.canComplete === true)) { log("移動尚未由 API 確認可完成；請重新讀取", accountId); return; }
  try {
    const result = await request("/move/complete", { method: "POST" }, accountId);
    state.heroes = mergeHeroes(state.heroes, result.heroes);
    await refresh(accountId);
    const info = await request("/huntInfo", {}, accountId);
    state.canForward = info.canForward ?? result.canForward ?? state.canForward;
    state.cooldownAt = Date.parse(info.huntAvailableAt || 0) || state.cooldownAt;
    log(`移動已完成，目前位置：${info.zoneName || result.zoneName || "未知"}`, accountId);
    if (!stopForDeaths(accountId)) warn(`移動已完成，位置：${info.zoneName || result.zoneName || "未知"}。狩獵維持停止。`, accountId);
  } catch (error) { warn(`完成移動結果未確認，請重新讀取：${error.message || error}`, accountId); }
}
async function rest(c, accountId) {
  const state = runtimeFor(accountId);
  const party = selectedParty(accountId);
  const resting = party.filter((hero) => Number(hero.actionState) === 2);
  if (resting.length) {
    if (resting.length !== party.length) throw new Error("勾選出戰隊伍休息狀態不一致；為避免只有部分角色行動，已停止");
    const dueAt = Math.max(...resting.map((hero) => {
      const serverEnd = Date.parse(hero.actionCompleteTime || 0) || Date.now();
      const started = Date.parse(hero.actionStart || 0);
      return Math.max(serverEnd, Number.isFinite(started) ? started + c.restMinutes * 60000 : 0);
    }));
    const waitMs = dueAt - Date.now();
    if (waitMs > 0 || !resting.every((hero) => hero.canComplete === true)) {
      const delay = waitMs > 0 ? waitMs + 2000 : 30000;
      state.restUntil = Date.now() + delay;
      debug(accountId, "rest.wait", { party: partyDebug(party), dueAt: new Date(dueAt).toISOString(), waitMs: delay, allCanComplete: resting.every((hero) => hero.canComplete === true) });
      log(`偵測到既有全隊休息；等待後重新檢查`, accountId); schedule(delay, accountId); return;
    }
    debug(accountId, "rest.complete", { party: partyDebug(party) });
    const result = await request("/heroes/restAll/complete", { method: "POST" }, accountId);
    state.heroes = mergeHeroes(state.heroes, result.huntInfo?.heroes);
    state.canForward = result.huntInfo?.canForward ?? state.canForward; state.restUntil = 0;
    if (accountId === activeId) renderHeroes(accountId);
    log("已完成全隊休息；下一輪重新檢查 HP／SP", accountId); schedule(1000, accountId); return;
  }
  if (party.some((hero) => Number(hero.actionState) !== 0)) throw new Error("出戰隊伍有未完成的非休息行動；請先完成行動");
  debug(accountId, "rest.start", { party: partyDebug(party), minMinutes: c.restMinutes });
  const result = await request("/heroes/restAll", { method: "POST" }, accountId);
  state.heroes = mergeHeroes(state.heroes, result.heroes); state.canForward = result.canForward ?? state.canForward;
  const updatedParty = selectedParty(accountId);
  const serverUntil = Math.max(...updatedParty.map((hero) => Date.parse(hero.actionCompleteTime || 0)), Date.now());
  state.restUntil = Math.max(serverUntil, Date.now() + c.restMinutes * 60000);
  if (accountId === activeId) renderHeroes(accountId);
  log("已啟動勾選出戰隊伍休息", accountId); schedule(state.restUntil - Date.now(), accountId);
}
async function hunt(c, accountId) {
  const state = runtimeFor(accountId);
  const party = selectedParty(accountId);
  if (Date.now() < state.cooldownAt) {
    debug(accountId, "hunt.cooldown", { cooldownAt: new Date(state.cooldownAt).toISOString(), waitMs: state.cooldownAt - Date.now() });
    return schedule(state.cooldownAt - Date.now(), accountId);
  }
  if (!partyVitalsValid(party)) throw new Error("出戰角色 HP／SP 或行動狀態無效，已停止");
  if (party.some((hero) => Number(hero.actionState) !== 0 || hero.perished || hero.hp <= 0)) throw new Error("出戰隊伍尚未全員空閒且存活；禁止開始狩獵");
  if (needsRest(c, accountId)) throw new Error("出戰角色未達 HP／SP 目標；禁止開始狩獵");
  const current = Number(party[0]?.huntStage);
  if (!Number.isInteger(current)) throw new Error("找不到出戰隊伍目前樓層");
  if (current > c.target) throw new Error("目前樓層已超過目標，未啟用自動後退");
  const forward = current < c.target;
  if (forward && state.canForward !== true) throw new Error("尚未確認可前行；請檢查狩獵狀態");
  debug(accountId, "hunt.start", { action: forward ? "forward" : "stay", currentStage: current, targetStage: c.target, party: partyDebug(party) });
  const result = await request(forward ? "/hunt?type=forward" : "/hunt", { method: "POST" }, accountId);
  const updates = result.huntInfo?.heroes || [];
  state.heroes = mergeHeroes(state.heroes, updates);
  state.canForward = result.huntInfo?.canForward ?? state.canForward;
  state.cooldownAt = Date.parse(result.huntInfo?.huntAvailableAt || 0) || 0;
  if (accountId === activeId) renderHeroes(accountId);
  log(forward ? "前行狩獵完成" : "原地狩獵完成", accountId);
  schedule(Math.max(1000, state.cooldownAt - Date.now()), accountId);
}
function stopForInvalidParty(accountId) {
  const state = runtimeFor(accountId);
  const all = state.heroes;
  if (all.some((hero) => typeof hero.selected !== "boolean")) throw new Error("角色出戰勾選狀態不明；未送出狩獵請求");
  const party = selectedParty(accountId);
  if (party.length > 4) throw new Error(`目前勾選 ${party.length} 名出戰角色；最多 4 名，未送出狩獵請求`);
  if (!partyVitalsValid(party)) throw new Error("出戰角色 HP／SP 上限或行動狀態無效");
  return party;
}
async function turn(accountId) {
  const state = runtimeFor(accountId);
  if (!state.running) return;
  state.nextWakeAt = Date.now();
  try {
    const c = config(accountId);
    if (!validConfig(c)) throw new Error("請檢查此帳號的自動狩獵設定");
    await refreshAccount(accountId);
    if (!state.running) return;
    const party = stopForInvalidParty(accountId);
    debug(accountId, "runner.turn", { config: c, party: partyDebug(party), deathMovePhase: state.deathMovePhase, deathRecoveryPhase: state.deathRecoveryPhase });
    if (state.deathMovePhase) { operation(accountId, "runner.branch", { branch: "death-move" }); debug(accountId, "runner.branch", { branch: "death-move" }); await continueDeathMove(accountId, party); return; }
    if (state.deathRecoveryPhase) { operation(accountId, "runner.branch", { branch: "death-recovery" }); debug(accountId, "runner.branch", { branch: "death-recovery" }); await continueDeathRecovery(accountId); return; }
    if (party.some((hero) => deathState(hero))) { operation(accountId, "runner.branch", { branch: "death-detected" }); debug(accountId, "runner.branch", { branch: "death-detected" }); await continueDeathMove(accountId, party); return; }
    if (party.some((hero) => Number(hero.actionState) === 2)) { operation(accountId, "runner.branch", { branch: "rest-existing" }); debug(accountId, "runner.branch", { branch: "rest-existing" }); await rest(c, accountId); return; }
    if (party.some((hero) => Number(hero.actionState) !== 0)) throw new Error("勾選出戰隊伍有移動或未識別行動；請先完成並重新讀取");
    if (needsRest(c, accountId)) { operation(accountId, "runner.branch", { branch: "rest-needed" }); debug(accountId, "runner.branch", { branch: "rest-needed" }); await rest(c, accountId); }
    else { operation(accountId, "runner.branch", { branch: "hunt" }); debug(accountId, "runner.branch", { branch: "hunt" }); await hunt(c, accountId); }
  } catch (error) {
    if (error.name !== "AbortError") debug(accountId, "runner.error", { message: error.message || String(error) });
    if (error.name !== "AbortError") log(error.message || String(error), accountId);
    if (state.running) stopRunner(accountId, "已因錯誤停止");
  }
}
function startRunner(accountId) {
  const state = runtimeFor(accountId);
  if (state.running || state.actionBusy) return;
  const c = config(accountId);
  if (!validConfig(c)) { warn("請先設定有效的狩獵目標與 HP／SP 門檻", accountId); return; }
  state.running = true; state.restUntil = 0;
  operation(accountId, "runner.started", { targetStage: c.target, hpTarget: c.hp, spTarget: c.sp });
  debug(accountId, "runner.started", { config: c });
  if (accountId === activeId) { $("alert").hidden = true; document.title = "Autoy"; setState(null, accountId); }
  state.watchdog = setInterval(() => {
    const settings = config(accountId);
    if (state.running && state.nextWakeAt && Date.now() > state.nextWakeAt + settings.alertMinutes * 60000) stopRunner(accountId, "超過無動作提醒時間，已停止");
  }, 30000);
  renderAccounts(); log("開始此帳號自動狩獵；先檢查出戰名單與目前行動", accountId); turn(accountId);
}
function stopAll() { for (const account of accounts) stopRunner(account.id); }
async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const textarea = document.createElement("textarea");
      textarea.value = text; textarea.style.position = "fixed"; textarea.style.opacity = "0";
      document.body.appendChild(textarea); textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("瀏覽器拒絕複製");
    }
    log(successMessage, activeId);
  } catch (error) {
    warn(`複製失敗：${error.message || error}`, activeId);
  }
}
function initAccountEvents() {
  $("account-form").onsubmit = (event) => {
    event.preventDefault();
    const label = $("account-label").value.trim();
    const token = $("account-token").value.trim().replace(/^Bearer\s+/i, "");
    if (!label || !token) return;
    const account = { id: crypto.randomUUID(), label, token, settings: defaultSettings() };
    accounts.push(account); runtimeFor(account.id); activeId = account.id; save(); event.target.reset(); loadSettings(account); render();
    log("已新增帳號；正在驗證 token", account.id);
    refreshAccount(account.id).catch((error) => warn(`讀取帳號資料失敗：${error.message || error}`, account.id));
  };
  $("refresh").onclick = () => refreshAccount(activeId).then(() => { if (!stopForDeaths(activeId)) { $("alert").hidden = true; log("角色與狩獵狀態已更新"); } }).catch((error) => log(error.message || String(error)));
  $("start").onclick = () => startRunner(activeId);
  $("stop").onclick = () => stopRunner(activeId);
  const stopAllButton = $("stop-all"); if (stopAllButton) stopAllButton.onclick = stopAll;
  $("clear-events").onclick = () => { const state = runtimeFor(activeId); state.messages = []; renderFlowMessages(activeId); };
  $("copy-events").onclick = () => copyText($("events").textContent, "流程訊息已複製");
  $("clear-operations").onclick = () => { const state = runtimeFor(activeId); state.operations = []; renderOperations(activeId); };
  $("copy-operations").onclick = () => copyText(JSON.stringify(runtimeFor(activeId).operations, null, 2), "操作紀錄 JSON 已複製");
  for (const id of ["target-stage", "hp-target", "sp-target", "rest-minutes", "alert-minutes", "flow-messages", "operation-log", "debug-console"]) $(id).addEventListener("change", () => {
    persistSettings();
    if (id === "operation-log" && $("operation-log").checked) operation(activeId, "operation-log.enabled", { message: "使用者啟用操作紀錄" });
    renderFlowMessages(activeId); renderOperations(activeId);
  });
}
function init() {
  initAccountEvents();
  if (active()) loadSettings();
  render();
  for (const account of accounts) refreshAccount(account.id).catch((error) => log(`讀取帳號資料失敗：${error.message || error}`, account.id));
  setInterval(() => {
    if (document.hidden || !activeId) return;
    refreshAccount(activeId, { quiet: true }).catch((error) => log(`自動重新讀取失敗：${error.message || error}`, activeId));
  }, 15000);
}
init();
