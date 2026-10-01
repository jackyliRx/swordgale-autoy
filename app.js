const API = "https://myteam.swordgale.online/api";
const uiVersion = "0.7.28";
const storeKey = "autoy.accounts.v1";
const itemRecoveryIncidentKey = "autoy.itemRecoveryIncidents.v1";
const itemRecoveryIncidentLimit = 100;
const itemRecoveryTimelineLimit = 30;
const forgeDebugLogKey = "autoy.forgeDebugLogs.v1";
const forgeDebugLogLimit = 200;
let accounts = JSON.parse(localStorage.getItem(storeKey) || "[]");
let itemRecoveryIncidents = loadItemRecoveryIncidents();
let forgeDebugLogs = loadForgeDebugLogs();
let activeId = accounts[0]?.id || null;
const runtimes = new Map();
const maxConcurrentApiRequests = 4;
const apiRequestTimeoutMs = 30000;
const clockSkewProbeMs = 1000;
let activeApiRequests = 0;
const apiRequestQueue = [];
const $ = (id) => document.getElementById(id);
const safe = (text) => String(text).replace(/[<>&]/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;"})[c]);
const active = () => accounts.find((a) => a.id === activeId);
function runtimeFor(id = activeId) {
  if (!runtimes.has(id)) {
    const account = accounts.find((entry) => entry.id === id);
    runtimes.set(id, { heroes: [], items: Array.isArray(account?.itemCatalog) ? account.itemCatalog : [], itemsUpdatedAt: Number(account?.itemsUpdatedAt) || 0, itemsPayload: null, itemsRefreshPromise: null, forgeProfile: null, forgeTypes: [], forgeMines: [], forgeDraft: { workshop: 1, enabled: false, heroId: "", name: "", type: "", selectedMines: [], recoveryItemId: "" }, forgeDataUpdatedAt: 0, forgeRunning: false, forgeTimer: null, forgeWakeAt: 0, forgeBusy: false, itemRecoveryActive: false, recoveryFallbackHeroes: new Set(), messages: [], operations: [], reports: [], currentReport: null, timer: null, refreshPromise: null, running: false, stopReason: null, cooldownAt: 0, serverClockOffsetMs: 0, restUntil: 0, canForward: null, nextWakeAt: 0, watchdog: null, aborters: new Set(), writeBusy: false, writeQueue: Promise.resolve(), actionBusy: false, recoveryRequests: new Set(), recoveryTimers: new Map(), deathMovePhase: null, deathRecoveryPhase: false, huntMovePhase: null });
  }
  return runtimes.get(id);
}
function localCooldownAt(value, state) {
  const serverCooldownAt = Date.parse(value || "");
  if (!Number.isFinite(serverCooldownAt)) return 0;
  const difference = serverCooldownAt - Date.now();
  if (Math.abs(difference) <= clockSkewProbeMs) state.serverClockOffsetMs = difference;
  return serverCooldownAt - state.serverClockOffsetMs;
}
function drainApiRequestQueue() {
  while (activeApiRequests < maxConcurrentApiRequests && apiRequestQueue.length) {
    const next = apiRequestQueue.shift();
    activeApiRequests += 1;
    Promise.resolve().then(next.task).then(next.resolve, next.reject).finally(() => {
      activeApiRequests -= 1;
      drainApiRequestQueue();
    });
  }
}
function queueApiRequest(task) {
  return new Promise((resolve, reject) => {
    apiRequestQueue.push({ task, resolve, reject });
    drainApiRequestQueue();
  });
}
async function fetchApi(url, options, controller) {
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, apiRequestTimeoutMs);
  try { return await fetch(url, options); }
  catch (error) {
    if (timedOut) throw new Error(`API 請求超過 ${apiRequestTimeoutMs / 1000} 秒未回應`);
    throw error;
  } finally { clearTimeout(timeout); }
}
for (const account of accounts) runtimeFor(account.id);
function save() { localStorage.setItem(storeKey, JSON.stringify(accounts)); }
function log(message, accountId = activeId) {
  const label = accounts.find((a) => a.id === accountId)?.label;
  const prefix = label ? `[${label}] ` : "";
  const account = accounts.find((entry) => entry.id === accountId);
  if (account?.settings?.flowMessages === false) return;
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
  $("operations").textContent = !account ? "尚未選擇帳號。" : account.settings?.operationLog !== true ? "此帳號未啟用操作紀錄。請在此視窗勾選後再記錄新的操作。" : state.operations.length ? JSON.stringify(state.operations, null, 2) : "尚未記錄操作。啟用後的下一個讀取或自動流程會出現在此處。";
}
function renderFlowMessages(accountId = activeId) {
  const account = accounts.find((entry) => entry.id === accountId);
  const state = runtimeFor(accountId);
  $("events").textContent = !account ? "尚未選擇帳號。" : account.settings?.flowMessages === false ? "此帳號未啟用流程訊息。請在此視窗勾選後再記錄新的訊息。" : state.messages.map((entry) => `[${entry.time}] ${entry.text}`).join("\n") || "尚無流程訊息。";
}
function formatReportTime(value) { const time = Date.parse(value || ""); return Number.isFinite(time) ? new Date(time).toLocaleString() : "時間未知"; }
function reportSummary(report) {
  const messages = Array.isArray(report?.messages) ? report.messages : [];
  const allies = Array.isArray(report?.a) ? report.a : [];
  const enemies = Array.isArray(report?.b) ? report.b : [];
  const allyDeaths = allies.filter((hero) => messages.some((entry) => entry?.m?.includes(`${hero.name}被擊殺死亡`))).map((hero) => hero.name);
  const enemyDeaths = enemies.filter((hero) => messages.some((entry) => entry?.m?.includes(`${hero.name}被擊殺死亡`))).map((hero) => hero.name);
  const dealt = messages.filter((entry) => entry?.dmged === "b").map((entry) => Number((entry.m || "").match(/造成\s*(\d+)\s*傷害/)?.[1]) || 0).reduce((sum, value) => sum + value, 0);
  const received = messages.filter((entry) => entry?.dmged === "a").map((entry) => Number((entry.m || "").match(/造成\s*(\d+)\s*傷害/)?.[1]) || 0).reduce((sum, value) => sum + value, 0);
  return { allies: allies.length, enemies: enemies.length, allyDeaths, enemyDeaths, dealt, received, critical: messages.filter((entry) => entry?.crucial === true || entry?.s === "critical").length };
}
function renderReports(accountId = activeId) {
  const state = runtimeFor(accountId);
  const reports = state.reports || [];
  $("report-list").innerHTML = reports.length ? reports.map((report) => `<button class="report-row ${Number(report.dead) > 0 ? "dead" : ""} ${String(state.currentReport?.id) === String(report.id) ? "active" : ""}" data-report-id="${encodeURIComponent(report.id)}"><strong>${safe(report.zoneName || "未知地區")} ${Number(report.stage) || 0} 層</strong><small>${safe(formatReportTime(report.time))} · ${Number(report.dead) > 0 ? `死亡 ${Number(report.dead)}` : "無死亡"}</small></button>`).join("") : "尚未讀取戰報。";
  document.querySelectorAll("[data-report-id]").forEach((button) => button.onclick = () => openReport(button.dataset.reportId, accountId).catch((error) => warn(`讀取戰報失敗：${error.message || error}`, accountId)));
  const report = state.currentReport;
  if (!report) { $("report-detail").textContent = "請從左側選擇一筆戰報。"; return; }
  const summary = reportSummary(report);
  const messages = (report.messages || []).map((entry) => `<li class="${safe(entry.s || "")}">${safe(entry.m || "")}</li>`).join("") || "<li>沒有戰報訊息。</li>";
  $("report-detail").innerHTML = `<h3>${safe(report.zone || "未知地區")} ${Number(report.stage) || 0} 層</h3><p class="hint">${safe(formatReportTime(report.time))}</p><div class="report-summary">我方 ${summary.allies} 人、敵方 ${summary.enemies} 人；造成傷害 ${summary.dealt}、承受傷害 ${summary.received}；關鍵事件 ${summary.critical} 次。<br>敵方擊殺：${summary.enemyDeaths.length ? safe(summary.enemyDeaths.join("、")) : "無"}。我方死亡：${summary.allyDeaths.length ? safe(summary.allyDeaths.join("、")) : "無"}。</div><h4>戰鬥過程</h4><ol class="report-messages">${messages}</ol>`;
}
async function loadReports(accountId = activeId) {
  const state = runtimeFor(accountId);
  const result = await request("/reports?type=hunt", {}, accountId);
  state.reports = Array.isArray(result.reports) ? result.reports : [];
  state.currentReport = null;
  renderReports(accountId);
  log(`已讀取 ${state.reports.length} 筆狩獵戰報列表`, accountId);
}
async function openReport(reportId, accountId = activeId) {
  if (!reportId) return;
  await request(`/reports/${encodeURIComponent(reportId)}/view`, { method: "POST" }, accountId);
  const result = await request(`/reports/${encodeURIComponent(reportId)}`, {}, accountId);
  runtimeFor(accountId).currentReport = result.report || null;
  renderReports(accountId);
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
  if (account?.settings) { const settings = { ...defaultSettings(), ...account.settings }; return { target: Number(settings.target), hp: Number(settings.hp), sp: Number(settings.sp), restHp: Number(settings.restHp), restSp: Number(settings.restSp), useItems: settings.useItems === true, teamItems: settings.teamItems || {}, heroItems: settings.heroItems || {}, restMinutes: Number(settings.restMinutes), alertMinutes: Number(settings.alertMinutes), flowMessages: settings.flowMessages !== false, operationLog: settings.operationLog === true, debug: settings.debug === true, itemRecoveryIncidentEnabled: settings.itemRecoveryIncidentEnabled === true, forgeDebugEnabled: settings.forgeDebugEnabled === true }; }
  return { target: Number($("target-stage").value), hp: Number($("hp-target").value), sp: Number($("sp-target").value), restHp: Number($("rest-hp-target").value), restSp: Number($("rest-sp-target").value), useItems: $("use-items").checked, teamItems: {}, heroItems: {}, restMinutes: Number($("rest-minutes").value), alertMinutes: Number($("alert-minutes").value), flowMessages: $("flow-messages").checked, operationLog: $("operation-log").checked, debug: $("debug-console").checked, itemRecoveryIncidentEnabled: $("item-recovery-incident-enabled").checked, forgeDebugEnabled: $("forge-debug-enabled").checked };
}
function validConfig(c) { return Number.isInteger(c.target) && c.target > 0 && c.hp >= 1 && c.hp <= 100 && c.sp >= 1 && c.sp <= 100 && c.restHp >= c.hp && c.restHp <= 100 && c.restSp >= c.sp && c.restSp <= 100 && c.restMinutes > 0 && c.alertMinutes >= 1; }
function defaultSettings() { return { target: 1, hp: 80, sp: 70, restHp: 90, restSp: 90, useItems: false, teamItems: {}, heroItems: {}, restMinutes: 1, alertMinutes: 3, flowMessages: true, operationLog: false, debug: false, itemRecoveryIncidentEnabled: false, forgeDebugEnabled: false, forgeEnabled: false, forgeWorkshops: {} }; }
function loadSettings(account = active()) {
  if (!account) return;
  account.settings = { ...defaultSettings(), ...(account.settings || {}) };
  $("target-stage").value = account.settings.target;
  $("hp-target").value = account.settings.hp;
  $("sp-target").value = account.settings.sp;
  $("rest-hp-target").value = account.settings.restHp;
  $("rest-sp-target").value = account.settings.restSp;
  $("rest-minutes").value = account.settings.restMinutes;
  $("alert-minutes").value = account.settings.alertMinutes;
  $("flow-messages").checked = account.settings.flowMessages !== false;
  $("operation-log").checked = account.settings.operationLog === true;
  $("debug-console").checked = account.settings.debug === true;
  $("item-recovery-incident-enabled").checked = account.settings.itemRecoveryIncidentEnabled === true;
  $("forge-debug-enabled").checked = account.settings.forgeDebugEnabled === true;
  renderItemSettings(account.id);
}
function persistSettings() {
  const account = active();
  if (!account) return;
  account.settings = configFromForm();
  save();
}
function configFromForm() {
  const previous = active()?.settings || defaultSettings();
  return { ...previous, target: Number($("target-stage").value), hp: Number($("hp-target").value), sp: Number($("sp-target").value), restHp: Number($("rest-hp-target").value), restSp: Number($("rest-sp-target").value), useItems: $("use-items").checked, restMinutes: Number($("rest-minutes").value), alertMinutes: Number($("alert-minutes").value), flowMessages: $("flow-messages").checked, operationLog: $("operation-log").checked, debug: $("debug-console").checked, itemRecoveryIncidentEnabled: $("item-recovery-incident-enabled").checked, forgeDebugEnabled: $("forge-debug-enabled").checked };
}
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
  let releaseWrite = null;
  if (isWrite) {
    const previousWrite = state.writeQueue || Promise.resolve();
    state.writeQueue = new Promise((resolve) => { releaseWrite = resolve; });
    await previousWrite.catch(() => {});
    state.writeBusy = true;
  }
  const controller = new AbortController();
  state.aborters.add(controller);
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const requestBody = operationRequestBody(options.body);
  try {
    operation(accountId, "api.request", { requestId, method, path, requestBody });
    debug(accountId, "api.request", { method, path });
    if (activeApiRequests >= maxConcurrentApiRequests) {
      operation(accountId, "api.queued", { requestId, method, path, queuedAhead: apiRequestQueue.length });
      debug(accountId, "api.queued", { method, path, queuedAhead: apiRequestQueue.length });
    }
    const response = await queueApiRequest(() => fetchApi(`${API}${path}`, { ...options, signal: controller.signal, headers: { token: account.token, ...(options.headers || {}) } }, controller));
    if (!response.ok) {
      const errorText = await response.text();
      operation(accountId, "api.failure", { requestId, method, path, requestBody, status: response.status, durationMs: Date.now() - startedAt, responseBody: operationRequestBody(errorText) });
      debug(accountId, "api.error", { method, path, status: response.status, response: errorText });
      const err = new Error(`API ${response.status}: ${errorText}`);
      try { err.responseBody = JSON.parse(errorText); } catch {}
      err.statusCode = response.status;
      throw err;
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
    if (isWrite) { state.writeBusy = false; releaseWrite?.(); }
  }
}
async function refresh(accountId = activeId) {
  const state = runtimeFor(accountId);
  const data = await request("/heroes", {}, accountId);
  state.heroes = data.heroes || [];
  if (accountId === activeId) { renderHeroes(accountId); log(`已讀取 ${state.heroes.length} 張角色卡`, accountId); }
  return state.heroes;
}
function itemQuantity(item) {
  const quantity = Number(item?.quantity);
  if (Number.isFinite(quantity)) return quantity;
  return item?.available === true ? 1 : 0;
}
function isSafeRecoveryItem(item) {
  const heals = Number(item?.healHp) > 0 || Number(item?.healSp) > 0;
  const effects = Array.isArray(item?.effectTexts) ? item.effectTexts.length > 0 : Boolean(String(item?.effectTexts || "").trim());
  return item && item.target === "hero" && item.available !== false && heals && !effects && !item.effectDurationSec;
}
function normalizeItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.items?.items)) return payload.items.items;
  return null;
}
function normalizeForgeMines(payload) {
  if (Array.isArray(payload?.mines)) return payload.mines;
  if (Array.isArray(payload?.items?.mines)) return payload.items.mines;
  return null;
}
function forgeWorkshopsFromProfile(profile) {
  const expanded = Number(profile?.forgeExpanded);
  return Number.isInteger(expanded) && expanded >= 0 ? Array.from({ length: expanded + 1 }, (_, index) => index + 1) : [];
}
function forgeEligibleHeroes(heroes) {
  return (heroes || []).filter((hero) => hero && Number(hero.hp) > 0 && hero.perished !== true && Number(hero.actionState) === 0 && Number(hero.huntZone) === 0);
}
function normalizeForgeTypesFromBundle(source) {
  const types = [];
  const seen = new Set();
  for (const match of String(source || "").matchAll(/\{id:`([^`]+)`,name:`([^`]+)`,limit:(\d+)/g)) {
    const [, id, name, limit] = match;
    if (seen.has(id)) continue;
    seen.add(id);
    types.push({ id, name, limit: Number(limit) });
  }
  return types;
}
function loadStoredForgeTypes() {
  return [
    { id: "sword",   name: "單手劍", limit: 16 },
    { id: "rapier",  name: "細劍",   limit: 14 },
    { id: "dagger",  name: "短刀",   limit: 11 },
    { id: "hammer",  name: "單手錘", limit: 16 },
    { id: "shield",  name: "shield", limit: 0  },
    { id: "thsword", name: "thsword",limit: 0  },
    { id: "katana",  name: "太刀",   limit: 20 },
    { id: "axe",     name: "axe",    limit: 0  },
    { id: "spear",   name: "spear",  limit: 0  },
  ];
}
function validateForgeDraft(draft, { workshops, heroes, mines, types }) {
  const workshop = Number(draft?.workshop);
  if (!workshops.includes(workshop)) return { ok: false, error: "鍛造坊已不存在或尚未讀取最新清單" };
  const hero = forgeEligibleHeroes(heroes).find((entry) => String(entry.id) === String(draft?.heroId));
  if (!hero) return { ok: false, error: "角色目前不可鍛造；請重新讀取" };
  const name = String(draft?.name || "").trim();
  if (!name) return { ok: false, error: "請輸入裝備名稱" };
  const type = (types || []).find((entry) => entry.id === draft?.type);
  if (!type || !Number.isInteger(Number(type.limit)) || Number(type.limit) <= 0) return { ok: false, error: "裝備類型或材料上限尚未讀取" };
  const requested = Array.isArray(draft?.selectedMines) ? draft.selectedMines : [];
  if (!requested.length) return { ok: false, error: "請至少選擇一個材料" };
  const merged = new Map();
  for (const entry of requested) {
    const itemId = String(entry?.itemId || ""); const quantity = Number(entry?.quantity);
    if (!itemId || !Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: "材料數量必須是正整數" };
    merged.set(itemId, (merged.get(itemId) || 0) + quantity);
  }
  const materialTotal = [...merged.values()].reduce((sum, quantity) => sum + quantity, 0);
  if (materialTotal > Number(type.limit)) return { ok: false, error: `材料總數 ${materialTotal} 超過 ${type.name} 上限 ${type.limit}` };
  for (const [itemId, quantity] of merged) {
    const mine = (mines || []).find((entry) => String(entry.id) === itemId);
    if (!mine || Number(mine.available) < quantity) return { ok: false, error: "材料庫存不足或已失效；請重新讀取" };
  }
  return { ok: true, materialTotal, type, hero, selectedMines: [...merged].map(([itemId, quantity]) => ({ itemId: Number(itemId), quantity })) };
}
function nextForgeAction({ workshops, heroes, drafts }) {
  for (const hero of heroes || []) {
    const as = Number(hero.actionState);
    if (as !== 4 && as !== 5) continue;
    const workshop = Number(hero.actionTarget);
    if (hero.canComplete === true) return { kind: "complete", workshop, heroId: hero.id };
    if (hero.actionCompleteTime) return { kind: "wait", workshop, heroId: hero.id, actionCompleteTime: hero.actionCompleteTime };
  }
  for (const workshop of workshops || []) {
    const draft = drafts?.[workshop];
    if (!draft?.enabled) continue;
    const hero = forgeEligibleHeroes(heroes).find((entry) => String(entry.id) === String(draft.heroId));
    if (hero && String(draft.name || "").trim() && draft.type && Array.isArray(draft.selectedMines) && draft.selectedMines.length) return { kind: "start", workshop: Number(workshop), heroId: hero.id };
  }
  return { kind: "idle" };
}
function loadForgeDebugLogs() {
  try { const value = JSON.parse(localStorage.getItem(forgeDebugLogKey) || "[]"); return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object").slice(0, forgeDebugLogLimit) : []; }
  catch { return []; }
}
function saveForgeDebugLogs() { localStorage.setItem(forgeDebugLogKey, JSON.stringify(forgeDebugLogs.slice(0, forgeDebugLogLimit))); }
function shouldRecordForgeDebug(settings) { return settings?.forgeDebugEnabled === true; }
function forgeSafeDetail(value) { return safeOperationPayload(value); }
function recordForgeDebug(accountId, event, detail = {}) {
  if (!shouldRecordForgeDebug(config(accountId))) return;
  forgeDebugLogs.unshift({ at: new Date().toISOString(), accountRef: String(accountId), event, ...forgeSafeDetail(detail) });
  forgeDebugLogs = forgeDebugLogs.slice(0, forgeDebugLogLimit);
  saveForgeDebugLogs();
  if ($("forge-debug-dialog")?.open) renderForgeDebugLogs();
}
function renderForgeDebugLogs() {
  const logs = forgeDebugLogs.filter((entry) => entry.accountRef === String(activeId));
  $("forge-debug-log-list").textContent = logs.length ? JSON.stringify(logs, null, 2) : "尚未記錄鍛造除錯資料。勾選後才會記錄新的鍛造流程。";
}
async function refreshForgeData(accountId = activeId) {
  const state = runtimeFor(accountId);
  recordForgeDebug(accountId, "forge-data.refresh.started");
  const types = loadStoredForgeTypes();
  const heroesPayloadPromise = state.refreshPromise ? state.refreshPromise.then(() => ({ heroes: state.heroes })) : request("/heroes", {}, accountId);
  const itemsPayloadPromise = refreshItems(accountId).then(() => state.itemsPayload);
  const [profile, heroesPayload, itemsPayload] = await Promise.all([
    request("/profile", {}, accountId),
    heroesPayloadPromise,
    itemsPayloadPromise,
  ]);
  state.forgeProfile = profile || null;
  state.heroes = heroesPayload?.heroes || [];
  state.items = normalizeItems(itemsPayload) || state.items;
  state.itemsPayload = itemsPayload || state.itemsPayload;
  state.itemsUpdatedAt = Date.now();
  state.forgeMines = normalizeForgeMines(itemsPayload) || [];
  state.forgeTypes = types;
  state.forgeDataUpdatedAt = Date.now();
  const workshops = forgeWorkshopsFromProfile(profile);
  const heroes = forgeEligibleHeroes(state.heroes);
  state.forgeDraft.workshop = workshops.includes(Number(state.forgeDraft.workshop)) ? Number(state.forgeDraft.workshop) : workshops[0] || 1;
  const saved = forgeDraftForWorkshop(accountId, state.forgeDraft.workshop);
  state.forgeDraft = { ...state.forgeDraft, ...saved, workshop: state.forgeDraft.workshop };
  const forgingHeroes = (state.heroes || []).filter((h) => { const as = Number(h.actionState); return (as === 4 || as === 5) && h.actionTarget != null; });
  const currentHasForge = forgingHeroes.some((h) => Number(h.actionTarget) === state.forgeDraft.workshop);
  const currentHasSettings = Boolean(state.forgeDraft.heroId) || state.forgeDraft.selectedMines.length > 0;
  if (!currentHasForge && !currentHasSettings && forgingHeroes.length > 0) {
    const firstTarget = Number(forgingHeroes[0].actionTarget);
    if (workshops.includes(firstTarget)) {
      state.forgeDraft.workshop = firstTarget;
      const activeSaved = forgeDraftForWorkshop(accountId, firstTarget);
      state.forgeDraft = { ...state.forgeDraft, ...activeSaved, workshop: firstTarget };
    }
  }
  if (!state.forgeDraft.heroId) state.forgeDraft.heroId = String(heroes[0]?.id || "");
  if (!state.forgeDraft.type) state.forgeDraft.type = types[0]?.id || "";
  recordForgeDebug(accountId, "forge-data.refresh.completed", { workshops: forgeWorkshopsFromProfile(profile).length, typeCount: types.length, eligibleHeroCount: forgeEligibleHeroes(state.heroes).length, mineCount: state.forgeMines.length });
  if (accountId === activeId) { renderHeroes(accountId); renderForgeSettings(); }
  return state;
}
function forgeDraftForWorkshop(accountId, workshop) {
  const account = accounts.find((entry) => entry.id === accountId);
  const saved = account?.settings?.forgeWorkshops?.[String(workshop)] || {};
  return { workshop: Number(workshop), enabled: saved.enabled === true, heroId: String(saved.heroId || ""), name: String(saved.name || ""), type: String(saved.type || ""), selectedMines: Array.isArray(saved.selectedMines) ? saved.selectedMines.map((entry) => ({ itemId: entry.itemId, quantity: Number(entry.quantity) })) : [], recoveryItemId: String(saved.recoveryItemId || "") };
}
function saveForgeDraft(accountId, draft) {
  const account = accounts.find((entry) => entry.id === accountId);
  if (!account) return;
  account.settings = { ...defaultSettings(), ...(account.settings || {}), forgeWorkshops: { ...(account.settings?.forgeWorkshops || {}), [String(draft.workshop)]: { enabled: draft.enabled === true, heroId: String(draft.heroId || ""), name: String(draft.name || "").trim(), type: String(draft.type || ""), selectedMines: (draft.selectedMines || []).map((entry) => ({ itemId: entry.itemId, quantity: Number(entry.quantity) })), recoveryItemId: String(draft.recoveryItemId || "") } } };
  save();
}
function hasConfiguredForgeWorkshop(workshops) {
  return Object.values(workshops || {}).some((draft) => draft?.enabled === true && Boolean(String(draft.heroId || "")) && Boolean(String(draft.name || "").trim()) && Boolean(String(draft.type || "")) && Array.isArray(draft.selectedMines) && draft.selectedMines.length > 0);
}
function renderForgeSettings(accountId = activeId) {
  const panel = $("forge-settings");
  if (!panel) return;
  const account = accounts.find((entry) => entry.id === accountId);
  const state = runtimeFor(accountId);
  if (!account) return;
  if (!state.forgeDataUpdatedAt) {
    panel.innerHTML = `<div class="item-settings-heading"><div><h3>自動鍛造</h3><p class="hint">按「重新讀取」以載入鍛造坊資料。</p></div></div><div class="item-grid"><fieldset disabled><label>選擇鍛造坊<select><option>等待讀取</option></select></label><label>選擇角色<select><option>等待讀取</option></select></label><label>裝備名稱<input value="等待讀取" /></label><label>裝備類型<select><option>等待讀取</option></select></label></fieldset><fieldset disabled><strong>選擇材料</strong><label>材料<select><option>等待讀取</option></select></label><label>數量<input value="1" /></label></fieldset></div><label class="checkbox-setting"><input id="forge-enabled" type="checkbox" disabled /> 啟用此帳號自動鍛造（需先完成至少一個鍛造坊排程）</label>`;
    return;
  }
  const workshops = forgeWorkshopsFromProfile(state.forgeProfile);
  const heroes = forgeEligibleHeroes(state.heroes);
  const draft = state.forgeDraft;
  const activeForges = new Map();
  for (const hero of state.heroes || []) { const as = Number(hero.actionState); if ((as === 4 || as === 5) && hero.actionTarget != null) activeForges.set(Number(hero.actionTarget), hero); }
  const currentActive = activeForges.get(Number(draft.workshop));
  const materialOptions = state.forgeMines.filter((mine) => Number(mine.available) > 0).map((mine) => `<option value="${safe(mine.id)}">${safe(mine.name)}（${Number(mine.available)}）</option>`).join("");
  const recoveryOptions = [`<option value="">不使用 SP 補品</option>`].concat(recoveryItems(accountId).map((item) => `<option value="${safe(item.id)}" ${String(draft.recoveryItemId) === String(item.id) ? "selected" : ""}>${safe(itemLabel(item))}</option>`)).join("");
  const selected = (draft.selectedMines || []).map((entry, index) => { const mine = state.forgeMines.find((candidate) => String(candidate.id) === String(entry.itemId)); return `<li>${safe(mine?.name || "已失效材料")} × ${Number(entry.quantity)} <button type="button" data-forge-remove-material="${index}">移除</button></li>`; }).join("") || "<li>尚未選擇材料。</li>";
  panel.innerHTML = `<div class="item-settings-heading"><div><h3>自動鍛造</h3><p class="hint">${state.forgeRunning ? "自動鍛造執行中；不影響自動狩獵。" : "每個鍛造坊保存各自的角色、名稱、類型、材料與 SP 補品。"}</p></div><label class="checkbox-setting"><input id="forge-enabled" type="checkbox" ${account.settings?.forgeEnabled === true ? "checked" : ""} /> 啟用此帳號自動鍛造</label></div><div class="item-grid"><div><label>選擇鍛造坊<select id="forge-workshop">${workshops.map((target) => { const af = activeForges.get(target); return `<option value="${target}" ${Number(draft.workshop) === target ? "selected" : ""}>${safe(af ? `鍛造坊 ${target} ─ ${af.name}` : `鍛造坊 ${target}`)}</option>`; }).join("")}</select></label>${currentActive ? `<p class="hint">▶ ${safe(currentActive.name)} 鍛造中${currentActive.actionCompleteTime ? `，預計完成 ${new Date(currentActive.actionCompleteTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</p>` : ""}<label class="checkbox-setting"><input id="forge-job-enabled" type="checkbox" ${draft.enabled ? "checked" : ""} /> 此鍛造坊排程</label><label>選擇角色<select id="forge-hero"><option value="">未選擇</option>${currentActive && !heroes.some((h) => String(h.id) === String(currentActive.id)) ? `<option value="${safe(currentActive.id)}" ${String(draft.heroId) === String(currentActive.id) ? "selected" : ""}>${safe(currentActive.name)}（鍛造中）</option>` : ""}${heroes.map((hero) => `<option value="${safe(hero.id)}" ${String(draft.heroId) === String(hero.id) ? "selected" : ""}>${safe(hero.name)}</option>`).join("")}</select></label><label>裝備名稱<input id="forge-name" maxlength="40" value="${safe(draft.name)}" /></label><label>裝備類型<select id="forge-type">${state.forgeTypes.map((type) => `<option value="${safe(type.id)}" ${draft.type === type.id ? "selected" : ""}>${safe(type.name)}（材料上限 ${Number(type.limit)}）</option>`).join("")}</select></label><label>完成後 SP 補品<select id="forge-recovery-item">${recoveryOptions}</select></label></div><div><strong>選擇材料</strong><label>材料<select id="forge-material">${materialOptions}</select></label><label>數量<input id="forge-material-quantity" type="number" min="1" value="1" /></label><button id="forge-add-material" type="button">加入材料</button><ul id="forge-selected-materials">${selected}</ul></div></div><p class="hint">更新時間：${safe(new Date(state.forgeDataUpdatedAt).toLocaleTimeString())}。每次開始與完成前都會重新讀取並驗證；不確定寫入結果時只重讀、不重送。</p>`;
  const persistDraft = () => saveForgeDraft(accountId, state.forgeDraft);
  $("forge-enabled").onchange = () => setForgeEnabled(accountId, $("forge-enabled").checked);
  $("forge-workshop").onchange = () => { persistDraft(); state.forgeDraft = forgeDraftForWorkshop(accountId, Number($("forge-workshop").value)); renderForgeSettings(accountId); };
  for (const [id, key] of [["forge-job-enabled", "enabled"], ["forge-hero", "heroId"], ["forge-name", "name"], ["forge-type", "type"], ["forge-recovery-item", "recoveryItemId"]]) $(id).onchange = () => { state.forgeDraft[key] = key === "enabled" ? $(id).checked : $(id).value; persistDraft(); renderForgeSettings(accountId); };
  $("forge-add-material").onclick = () => { const itemId = $("forge-material").value; const quantity = Number($("forge-material-quantity").value); if (!itemId || !Number.isInteger(quantity) || quantity <= 0) return; state.forgeDraft.selectedMines = [...state.forgeDraft.selectedMines, { itemId, quantity }]; persistDraft(); renderForgeSettings(accountId); };
  panel.querySelectorAll("[data-forge-remove-material]").forEach((button) => button.onclick = () => { state.forgeDraft.selectedMines.splice(Number(button.dataset.forgeRemoveMaterial), 1); persistDraft(); renderForgeSettings(accountId); });
}
function forgeSchedule(delayMs, accountId) {
  const state = runtimeFor(accountId);
  clearTimeout(state.forgeTimer);
  state.forgeWakeAt = Date.now() + Math.max(1000, delayMs);
  state.forgeTimer = setTimeout(() => forgeTurn(accountId), Math.max(1000, delayMs));
}
function stopForgeRunner(accountId, reason = "已停止") {
  const state = runtimeFor(accountId);
  state.forgeRunning = false;
  clearTimeout(state.forgeTimer);
  state.forgeTimer = null;
  state.forgeWakeAt = 0;
  recordForgeDebug(accountId, "forge.runner.stopped", { reason });
  if (reason !== "已停止") log(`自動鍛造已停止：${reason}`, accountId);
  if (accountId === activeId) renderForgeSettings(accountId);
}
function setForgeEnabled(accountId, enabled) {
  const account = accounts.find((entry) => entry.id === accountId);
  if (!account) return;
  if (enabled && !hasConfiguredForgeWorkshop(account.settings?.forgeWorkshops)) {
    warn("請先完成並啟用至少一個鍛造坊排程，再啟用此帳號自動鍛造", accountId);
    if (accountId === activeId) renderForgeSettings(accountId);
    return;
  }
  account.settings = { ...defaultSettings(), ...(account.settings || {}), forgeEnabled: enabled === true };
  save();
  if (enabled) {
    const state = runtimeFor(accountId);
    if (!state.forgeRunning) { state.forgeRunning = true; state.forgeBusy = false; recordForgeDebug(accountId, "forge.runner.started"); forgeSchedule(1, accountId); }
  } else stopForgeRunner(accountId);
  if (accountId === activeId) renderForgeSettings(accountId);
}
function forgeWaitMs(actionCompleteTime) {
  const dueAt = Date.parse(actionCompleteTime || "");
  return Number.isFinite(dueAt) && dueAt > Date.now() ? dueAt - Date.now() + 2000 : 30000;
}
function forgeDrafts(accountId, workshops) {
  return Object.fromEntries((workshops || []).map((workshop) => [workshop, forgeDraftForWorkshop(accountId, workshop)]));
}
async function refreshForgeAfterUncertainWrite(accountId, event, error) {
  recordForgeDebug(accountId, event, { outcome: "uncertain", error: String(error?.message || error).slice(0, 160) });
  try { await refreshForgeData(accountId); }
  catch (refreshError) { recordForgeDebug(accountId, `${event}.refresh-failed`, { error: String(refreshError?.message || refreshError).slice(0, 160) }); }
}
async function useForgeRecoveryItem(accountId, workshop, hero) {
  if (Number(hero.sp) > 0 || Number(hero.fullSp) <= 0 || Number(hero.sp) >= Number(hero.fullSp)) return;
  const draft = forgeDraftForWorkshop(accountId, workshop);
  const item = draft.recoveryItemId ? itemById(draft.recoveryItemId, accountId) : null;
  if (!item || itemQuantity(item) <= 0) {
    const account = accounts.find((entry) => entry.id === accountId);
    if (account) { account.settings = { ...account.settings, forgeEnabled: false }; save(); }
    stopForgeRunner(accountId, "完成鍛造後角色 SP 為 0，且此鍛造坊未設定可用 SP 補品");
    return;
  }
  try {
    await request(`/items/${encodeURIComponent(item.id)}/use`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quantity: 1, heroId: hero.id }) }, accountId);
    await refreshForgeData(accountId);
    recordForgeDebug(accountId, "forge.recovery.completed", { workshop: Number(workshop), outcome: "confirmed" });
  } catch (error) {
    await refreshForgeAfterUncertainWrite(accountId, "forge.recovery.write", error);
  }
}
async function forgeTurn(accountId) {
  const state = runtimeFor(accountId);
  if (!state.forgeRunning || state.forgeBusy) return;
  state.forgeBusy = true;
  try {
    await refreshForgeData(accountId);
    if (!state.forgeRunning) return;
    const workshops = forgeWorkshopsFromProfile(state.forgeProfile);
    const drafts = forgeDrafts(accountId, workshops);
    const action = nextForgeAction({ workshops, heroes: state.heroes, drafts });
    if (action.kind === "wait") { recordForgeDebug(accountId, "forge.wait", { workshop: action.workshop, waitMs: forgeWaitMs(action.actionCompleteTime) }); forgeSchedule(forgeWaitMs(action.actionCompleteTime), accountId); return; }
    if (action.kind === "complete") {
      try {
        await request(`/heroes/${encodeURIComponent(action.heroId)}/completeForge`, { method: "POST" }, accountId);
        await refreshForgeData(accountId);
        const hero = state.heroes.find((entry) => String(entry.id) === String(action.heroId));
        if (hero && (Number(hero.actionState) === 4 || Number(hero.actionState) === 5)) throw new Error("完成鍛造後最新狀態仍顯示鍛造中");
        recordForgeDebug(accountId, "forge.complete.confirmed", { workshop: action.workshop });
        if (hero) await useForgeRecoveryItem(accountId, action.workshop, hero);
      } catch (error) { await refreshForgeAfterUncertainWrite(accountId, "forge.complete.write", error); }
      if (state.forgeRunning) forgeSchedule(1000, accountId);
      return;
    }
    if (action.kind === "start") {
      let candidate = null;
      for (const workshop of workshops) {
        const draft = drafts[workshop];
        if (!draft?.enabled) continue;
        const validated = validateForgeDraft(draft, { workshops, heroes: state.heroes, mines: state.forgeMines, types: state.forgeTypes });
        if (validated.ok) { candidate = { workshop, draft, validated }; break; }
        recordForgeDebug(accountId, "forge.start.skipped", { workshop: Number(workshop), reason: validated.error });
      }
      if (!candidate) { forgeSchedule(30000, accountId); return; }
      const { workshop, draft, validated } = candidate;
      try {
        await request("/forge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ heroId: validated.hero.id, target: Number(workshop), name: draft.name.trim(), type: draft.type, selectedMines: validated.selectedMines }) }, accountId);
        await refreshForgeData(accountId);
        const hero = state.heroes.find((entry) => String(entry.id) === String(validated.hero.id));
        if (!hero || (Number(hero.actionState) !== 4 && Number(hero.actionState) !== 5) || Number(hero.actionTarget) !== Number(workshop)) throw new Error("開始鍛造後最新狀態未確認派工");
        recordForgeDebug(accountId, "forge.start.confirmed", { workshop: Number(workshop), materialTotal: validated.materialTotal });
        forgeSchedule(forgeWaitMs(hero.actionCompleteTime), accountId);
      } catch (error) { await refreshForgeAfterUncertainWrite(accountId, "forge.start.write", error); if (state.forgeRunning) forgeSchedule(30000, accountId); }
      return;
    }
    forgeSchedule(30000, accountId);
  } catch (error) {
    recordForgeDebug(accountId, "forge.turn.error", { error: String(error?.message || error).slice(0, 160) });
    if (state.forgeRunning) forgeSchedule(30000, accountId);
  } finally { state.forgeBusy = false; }
}
function loadItemRecoveryIncidents() {
  try { const value = JSON.parse(localStorage.getItem(itemRecoveryIncidentKey) || "[]"); return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object").slice(0, itemRecoveryIncidentLimit) : []; }
  catch { return []; }
}
function saveItemRecoveryIncidents() { localStorage.setItem(itemRecoveryIncidentKey, JSON.stringify(itemRecoveryIncidents.slice(0, itemRecoveryIncidentLimit))); }
function itemRecoverySnapshot(item) { return item ? { itemId: String(item.id), name: String(item.name || "").slice(0, 80) || null, quantity: itemQuantity(item), available: Number.isFinite(Number(item.available)) ? Number(item.available) : null } : null; }
function heroRecoverySnapshot(hero) { return hero ? { id: String(hero.id), hp: Number(hero.hp), sp: Number(hero.sp) } : null; }
function shouldRecordItemRecoveryIncident(settings) { return settings?.itemRecoveryIncidentEnabled === true; }
function shouldInterceptItemRecoveryIssue(settings) { return settings?.itemRecoveryIncidentEnabled === true; }
function classifyAbortedItemUse({ beforeQuantity, verifiedQuantity }) {
  return Number.isFinite(Number(beforeQuantity)) && Number.isFinite(Number(verifiedQuantity)) && Number(verifiedQuantity) < Number(beforeQuantity) ? "consumed" : "unconfirmed";
}
function classifyInventoryVerification({ beforeQuantity, verifiedQuantity }) {
  if (!Number.isFinite(Number(beforeQuantity)) || !Number.isFinite(Number(verifiedQuantity))) return { status: "unconfirmed", kind: "inventory-unavailable" };
  if (Number(verifiedQuantity) < Number(beforeQuantity)) return { status: "resolved", kind: "inventory-consumed" };
  return { status: "confirmed", kind: Number(verifiedQuantity) > Number(beforeQuantity) ? "inventory-increased" : "inventory-not-decreased" };
}
function shouldResumeAfterAbortedItemUse(stopReason) { return /超過無動作提醒時間|已因錯誤停止/.test(String(stopReason || "")); }
function createItemRecoveryIncident(accountId, kind, message, detail, { status = "pending", verify = true } = {}) {
  if (!shouldRecordItemRecoveryIncident(config(accountId))) return null;
  const incident = { incidentId: crypto.randomUUID(), createdAt: new Date().toISOString(), accountRef: String(accountId), kind, status, message, timeline: [{ at: new Date().toISOString(), type: "detected", ...detail }] };
  itemRecoveryIncidents.unshift(incident); itemRecoveryIncidents = itemRecoveryIncidents.slice(0, itemRecoveryIncidentLimit); saveItemRecoveryIncidents();
  if (verify) scheduleItemRecoveryIncidentVerification(incident.incidentId, detail.item?.itemId, accountId);
  return incident;
}
function appendItemRecoveryIncident(incidentId, type, detail, status) {
  const incident = itemRecoveryIncidents.find((entry) => entry.incidentId === incidentId);
  if (!incident) return;
  incident.timeline = [...incident.timeline, { at: new Date().toISOString(), type, ...detail }].slice(-itemRecoveryTimelineLimit);
  if (status) incident.status = status;
  saveItemRecoveryIncidents();
  if ($("item-recovery-incidents")?.open) renderItemRecoveryIncidents();
}
function finalizeItemRecoveryIncident(incidentId, classification) {
  const incident = itemRecoveryIncidents.find((entry) => entry.incidentId === incidentId);
  if (!incident) return;
  incident.status = classification.status;
  incident.kind = classification.kind;
  incident.message = classification.kind === "inventory-increased" ? "補品效果已生效，庫存反而增加" : classification.kind === "inventory-not-decreased" ? "補品效果已生效，但庫存未扣除" : classification.kind === "inventory-consumed" ? "後續背包驗證確認補品已消耗" : "背包資料不足，無法確認補品庫存";
  saveItemRecoveryIncidents();
  if ($("item-recovery-incidents")?.open) renderItemRecoveryIncidents();
}
function itemRecoveryRuntimeSnapshot(accountId) {
  const state = runtimeFor(accountId);
  return { running: state.running, itemRecoveryActive: state.itemRecoveryActive, writeBusy: state.writeBusy, activeApiRequests, queuedApiRequests: apiRequestQueue.length, stopReason: state.stopReason || null };
}
function scheduleItemRecoveryIncidentVerification(incidentId, itemId, accountId) {
  [1000, 5000, 15000].forEach((delay, index, delays) => window.setTimeout(async () => {
    try {
      const items = await refreshItems(accountId);
      const item = (items || []).find((entry) => String(entry.id) === String(itemId));
      const incident = itemRecoveryIncidents.find((entry) => entry.incidentId === incidentId);
      const snapshot = itemRecoverySnapshot(item);
      const beforeQuantity = incident?.timeline?.[0]?.item?.before?.quantity;
      appendItemRecoveryIncident(incidentId, "inventory-verification", { scheduledDelayMs: delay, elapsedMs: incident ? Date.now() - Date.parse(incident.createdAt) : null, item: snapshot, quantityDelta: Number.isFinite(Number(beforeQuantity)) && Number.isFinite(Number(snapshot?.quantity)) ? Number(snapshot.quantity) - Number(beforeQuantity) : null, runtime: itemRecoveryRuntimeSnapshot(accountId) });
      if (index === delays.length - 1) {
        const quantities = (itemRecoveryIncidents.find((entry) => entry.incidentId === incidentId)?.timeline || []).filter((entry) => entry.type === "inventory-verification").map((entry) => Number(entry.item?.quantity)).filter(Number.isFinite);
        const classification = classifyInventoryVerification({ beforeQuantity, verifiedQuantity: quantities.length ? Math.min(...quantities) : null });
        finalizeItemRecoveryIncident(incidentId, classification);
      }
    } catch (error) { appendItemRecoveryIncident(incidentId, "inventory-verification-error", { scheduledDelayMs: delay, error: String(error.message || error).slice(0, 160), runtime: itemRecoveryRuntimeSnapshot(accountId) }, index === delays.length - 1 ? "unconfirmed" : undefined); }
  }, delay));
}
function renderItemRecoveryIncidents() {
  const incidents = itemRecoveryIncidents.filter((entry) => entry.accountRef === String(activeId));
  $("item-recovery-incident-list").textContent = incidents.length ? JSON.stringify(incidents, null, 2) : "尚未記錄補品異常。正常補品流程不會寫入此處。";
}
function recoveryItems(accountId = activeId) { return runtimeFor(accountId).items.filter(isSafeRecoveryItem); }
function itemById(itemId, accountId = activeId) { return recoveryItems(accountId).find((item) => String(item.id) === String(itemId)); }
function itemLabel(item) {
  if (!item) return "未設定";
  const heals = [Number(item.healHp) > 0 ? `HP +${item.healHp}` : "", Number(item.healSp) > 0 ? `SP +${item.healSp}` : ""].filter(Boolean).join("、");
  return `${item.name}（${heals}，庫存 ${itemQuantity(item)}）`;
}
async function refreshItems(accountId = activeId) {
  const state = runtimeFor(accountId);
  if (state.itemsRefreshPromise) return state.itemsRefreshPromise;
  state.itemsRefreshPromise = (async () => {
    const result = await request("/items", {}, accountId);
    state.itemsPayload = result;
    state.items = normalizeItems(result) || [];
    state.itemsUpdatedAt = Date.now();
    const account = accounts.find((entry) => entry.id === accountId);
    if (account) { account.itemCatalog = state.items; account.itemsUpdatedAt = state.itemsUpdatedAt; save(); }
    if (accountId === activeId) renderItemSettings(accountId);
    return state.items;
  })();
  try { return await state.itemsRefreshPromise; }
  finally { state.itemsRefreshPromise = null; }
}
function itemSelect(name, value, accountId) {
  const options = [`<option value="">未設定</option>`].concat(recoveryItems(accountId).map((item) => `<option value="${safe(item.id)}" ${String(value || "") === String(item.id) ? "selected" : ""}>${safe(itemLabel(item))}</option>`));
  return `<select data-item-setting="${safe(name)}">${options.join("")}</select>`;
}
function renderItemSettings(accountId = activeId) {
  const panel = $("item-settings");
  if (!panel) return;
  const account = accounts.find((entry) => entry.id === accountId);
  const state = runtimeFor(accountId);
  if (!account || accountId !== activeId) return;
  const settings = { ...defaultSettings(), ...(account.settings || {}) };
  const hasItems = state.itemsUpdatedAt > 0;
  const inventoryHint = hasItems ? `${recoveryItems(accountId).length} 種可用恢復補品；上次讀取 ${new Date(state.itemsUpdatedAt).toLocaleTimeString()}` : "尚未讀取背包";
  const team = settings.teamItems || {};
  const heroes = (state.heroes || []).filter((hero) => hero.selected === true);
  panel.innerHTML = `<div class="item-settings-heading"><div><h3>補品設定</h3><p class="hint">${safe(inventoryHint)}。能力增益、裝備、礦物與材料不會出現在選單。</p></div></div>
    <label class="checkbox-setting item-enable"><input id="use-items" type="checkbox" ${settings.useItems === true ? "checked" : ""} /> 使用補品；未勾選時維持休息流程</label>
    <div class="item-grid"><div><strong>全隊預設</strong><label>HP 補品${itemSelect("team.hp", team.hp, accountId)}</label><label>SP 補品${itemSelect("team.sp", team.sp, accountId)}</label><label>雙恢復補品${itemSelect("team.both", team.both, accountId)}</label></div>
    <div class="item-hero-settings"><strong>出戰角色指定（未指定或用完時改用全隊預設）</strong>${heroes.length ? heroes.map((hero) => { const own = settings.heroItems?.[String(hero.id)] || {}; return `<div class="item-hero-row"><span>${safe(hero.name)}</span><label>HP${itemSelect(`hero.${hero.id}.hp`, own.hp, accountId)}</label><label>SP${itemSelect(`hero.${hero.id}.sp`, own.sp, accountId)}</label><label>雙恢復${itemSelect(`hero.${hero.id}.both`, own.both, accountId)}</label></div>`; }).join("") : "<p class=\"hint\">目前沒有勾選出戰角色。</p>"}</div></div>`;
  $("use-items").onchange = () => { persistSettings(); renderItemSettings(accountId); };
  panel.querySelectorAll("[data-item-setting]").forEach((select) => select.onchange = () => {
    const key = select.dataset.itemSetting.split(".");
    account.settings = { ...defaultSettings(), ...(account.settings || {}) };
    if (key[0] === "team") account.settings.teamItems = { ...(account.settings.teamItems || {}), [key[1]]: select.value || "" };
    else {
      const heroId = key[1]; const kind = key[2];
      account.settings.heroItems = { ...(account.settings.heroItems || {}), [heroId]: { ...(account.settings.heroItems || {})[heroId], [kind]: select.value || "" } };
    }
    save();
  });
}
async function refreshAccount(accountId = activeId, { quiet = false } = {}) {
  const state = runtimeFor(accountId);
  if (state.refreshPromise) return state.refreshPromise;
  state.refreshPromise = (async () => {
    const heroData = await request("/heroes", {}, accountId);
    const huntInfo = await request("/huntInfo", {}, accountId);
    state.heroes = heroData.heroes || [];
    state.canForward = huntInfo.canForward ?? null;
    state.cooldownAt = localCooldownAt(huntInfo.huntAvailableAt, state);
    debug(accountId, "state.refreshed", { party: partyDebug(state.heroes.filter((hero) => hero.selected === true)), huntZone: huntInfo.huntZone, huntStage: huntInfo.huntStage, canForward: state.canForward, cooldownAt: huntInfo.huntAvailableAt || null });
    if (accountId === activeId) {
      renderHeroes(accountId);
      renderItemSettings(accountId);
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
    return `<div class="account ${account.id === activeId ? "active" : ""}"><div class="account-summary"><button data-select="${account.id}">${safe(account.label)}</button></div><div class="account-actions"><div class="actions"><button data-run="${account.id}" class="${state.running ? "danger" : "primary"}">${state.running ? "停止" : "啟動"}</button><button data-copy-token="${account.id}">Token</button><button data-delete="${account.id}">移除</button></div><small>${state.running ? "自動狩獵中" : "已停止"} · token 已設定</small></div></div>`;
  }).join("");
  document.querySelectorAll("[data-select]").forEach((button) => button.onclick = () => {
    activeId = button.dataset.select;
    loadSettings(active());
    render();
    loadAccountSnapshot(activeId);
  });
  document.querySelectorAll("[data-run]").forEach((button) => button.onclick = () => {
    const id = button.dataset.run;
    runtimeFor(id).running ? stopRunner(id) : startRunner(id);
  });
  document.querySelectorAll("[data-copy-token]").forEach((button) => button.onclick = () => {
    const id = button.dataset.copyToken;
    const account = accounts.find((entry) => entry.id === id);
    if (account) copyText(account.token, `${account.label} 的 TOKEN 已複製`, id);
  });
  document.querySelectorAll("[data-delete]").forEach((button) => button.onclick = () => {
    const id = button.dataset.delete;
    stopRunner(id, "帳號已移除");
    stopForgeRunner(id, "帳號已移除");
    clearRecoveryTimers(id);
    accounts = accounts.filter((account) => account.id !== id);
    runtimes.delete(id);
    if (activeId === id) { activeId = accounts[0]?.id || null; if (active()) loadSettings(); }
    save(); render();
  });
}
async function loadAccountSnapshot(accountId) {
  try {
    const data = await request("/heroes", {}, accountId);
    const state = runtimeFor(accountId);
    state.heroes = data.heroes || [];
    if (accountId === activeId) { renderHeroes(accountId); renderItemSettings(accountId); }
  } catch { /* Keep locally saved item and hero settings visible when offline. */ }
}
function renderHeroes(accountId = activeId) {
  const state = runtimeFor(accountId);
  if (accountId !== activeId) return;
  const heroes = state.heroes.map((hero, index) => ({ hero, index }));
  const selectedOrder = heroes.filter(({ hero }) => hero.selected === true).sort((a, b) => {
    const aPosition = Number(a.hero.position);
    const bPosition = Number(b.hero.position);
    const aHasPosition = Number.isFinite(aPosition);
    const bHasPosition = Number.isFinite(bPosition);
    if (aHasPosition && bHasPosition && aPosition !== bPosition) return aPosition - bPosition;
    return a.index - b.index;
  });
  const rankById = new Map(selectedOrder.map(({ hero }, index) => [String(hero.id), index + 1]));
  const orderedHeroes = [...selectedOrder.map(({ hero }) => hero), ...heroes.filter(({ hero }) => hero.selected !== true).map(({ hero }) => hero)];
  const meter = (label, current, maximum, color) => {
    const value = Number(current);
    const cap = Number(maximum);
    const percent = Number.isFinite(value) && Number.isFinite(cap) && cap > 0 ? Math.max(0, Math.min(100, value / cap * 100)) : 0;
    const text = `${Number.isFinite(value) ? value : "-"}/${Number.isFinite(cap) ? cap : "-"}`;
    return `<div class="hero-meter ${color}"><div class="hero-meter-label"><span>${label}</span><span>${text}</span></div><div class="hero-meter-track" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="${Number.isFinite(cap) && cap > 0 ? cap : 100}" aria-valuenow="${Number.isFinite(value) ? value : 0}"><span style="width:${percent}%"></span></div></div>`;
  };
  $("heroes").innerHTML = orderedHeroes.map((hero) => {
    const recovery = deathState(hero);
    const reviving = recovery === "death" && Number(hero.actionState) === 3;
    const moving = Number(hero.actionState) === 1;
    const resting = Number(hero.actionState) === 2;
    const actionCode = Number(hero.actionState);
    const actionTarget = hero.actionTarget === null || hero.actionTarget === undefined ? "" : `，目標 ${hero.actionTarget}`;
    const actionComplete = hero.actionCompleteTime ? `，完成時間 ${formatTime(hero.actionCompleteTime)}` : "";
    const status = recovery === "final-death" ? "死透了：需要轉生後復活" : reviving ? `重生中，完成時間 ${formatTime(hero.actionCompleteTime)}` : recovery === "death" ? "死亡：需要重生／復活" : moving ? `移動中，完成時間 ${formatTime(hero.actionCompleteTime)}` : resting ? `休息中，完成時間 ${formatTime(hero.actionCompleteTime)}${hero.canComplete === true ? "（可完成）" : ""}` : actionCode === 0 ? "空閒" : `其他遊戲行動中（狀態 ${actionCode}${actionTarget}${actionComplete}）`;
    const rank = rankById.get(String(hero.id));
    const duty = rank ? `出戰 ${rank}` : hero.selected === false ? "未出戰" : "出戰狀態未知";
    const recoveryLink = recovery ? `<a class="recovery-link" href="https://myteam.swordgale.online/heroes/${encodeURIComponent(hero.id)}" target="_blank" rel="noopener noreferrer">前往遊戲手動復原</a>` : "";
    return `<article class="hero ${recovery ? "hero-dead" : ""} ${rank ? "hero-selected" : ""}"><div class="hero-heading"><strong>${safe(hero.name)}</strong><span class="hero-duty ${rank ? "selected" : ""}">${duty}</span></div><p>${safe(hero.zoneName || "-")} · ${hero.huntStage ?? "-"} 層</p><div class="hero-meters">${meter("HP", hero.hp, hero.fullHp, "hp")}${meter("體力", hero.sp, hero.fullSp, "sp")}${meter("經驗", hero.exp, hero.fullExp, "exp")}</div><p>${status}</p>${recoveryLink}</article>`;
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
  if (account) { $("active-label").textContent = account.label; loadSettings(account); renderHeroes(account.id); renderForgeSettings(account.id); renderFlowMessages(account.id); renderOperations(account.id); renderReports(account.id); setState(null, account.id); }
  else { $("heroes").innerHTML = ""; $("death-actions").innerHTML = ""; $("party-summary").textContent = ""; renderFlowMessages(); renderOperations(); renderReports(); }
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
function recoveryWaitAt(heroes) {
  return Math.max(...heroes.map((hero) => Date.parse(hero.actionCompleteTime || 0) || 0), 0);
}
async function restSurvivorsDuringRevival(accountId) {
  const state = runtimeFor(accountId);
  const survivors = selectedParty(accountId).filter((hero) => !deathState(hero));
  if (!survivors.length) return false;
  const resting = survivors.filter((hero) => Number(hero.actionState) === 2);
  if (resting.length === survivors.length) return true;
  if (survivors.some((hero) => Number(hero.actionState) !== 0)) throw new Error("Recovery survivor has an unrecognized action");
  const result = await request("/heroes/restAll", { method: "POST" }, accountId);
  state.heroes = mergeHeroes(state.heroes, result.heroes || result.huntInfo?.heroes);
  state.canForward = result.canForward ?? result.huntInfo?.canForward ?? state.canForward;
  if (accountId === activeId) renderHeroes(accountId);
  log(`死亡復原期間：已讓 ${survivors.length} 名存活出戰角色開始全部休息`, accountId);
  return true;
}
async function completeSurvivorRestAfterRevival(accountId) {
  const state = runtimeFor(accountId);
  const resting = selectedParty(accountId).filter((hero) => Number(hero.actionState) === 2);
  if (!resting.length) return false;
  if (!resting.every((hero) => hero.canComplete === true)) return false;
  const result = await request("/heroes/restAll/complete", { method: "POST" }, accountId);
  state.heroes = mergeHeroes(state.heroes, result.heroes || result.huntInfo?.heroes);
  state.canForward = result.canForward ?? result.huntInfo?.canForward ?? state.canForward;
  state.restUntil = 0;
  if (accountId === activeId) renderHeroes(accountId);
  log(`死亡復原期間：已完成 ${resting.length} 名存活出戰角色的全部休息`, accountId);
  return true;
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
      await restSurvivorsDuringRevival(accountId);
      party = selectedParty(accountId);
      const survivors = party.filter((hero) => !deathState(hero));
      const restingSurvivors = survivors.filter((hero) => Number(hero.actionState) === 2);
      const allRevivesReady = accountDeaths.every((hero) => hero.canComplete === true);
      const allRestsReady = !restingSurvivors.length || restingSurvivors.every((hero) => hero.canComplete === true);
      if (!allRevivesReady || !allRestsReady) {
        const waiting = [...accountDeaths, ...restingSurvivors];
        const dueAt = recoveryWaitAt(waiting);
        const wait = dueAt > Date.now() ? dueAt - Date.now() + 2000 : 30000;
        log(`重生與存活隊員休息進行中；依最晚完成時間等待約 ${Math.ceil(wait / 1000)} 秒後繼續`, accountId);
        schedule(wait, accountId);
        return true;
      }
      const result = await request("/heroes/reviveAll/complete", { method: "POST" }, accountId);
      state.heroes = mergeHeroes(state.heroes, result.heroes);
      await refreshAccount(accountId);
      const stillDead = selectedParty(accountId).filter((hero) => deathState(hero) === "death");
      if (stillDead.length) throw new Error(`批次完成重生後仍有 ${stillDead.length} 名出戰角色死亡；停止以避免重複完成`);
      await completeSurvivorRestAfterRevival(accountId);
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
function partyLocation(party) {
  if (!party.length) return null;
  const zone = Number(party[0].huntZone);
  const stage = Number(party[0].huntStage);
  return party.every((hero) => Number(hero.huntZone) === zone && Number(hero.huntStage) === stage) ? { zone, stage } : null;
}
async function continueDeathMove(accountId, party) {
  const state = runtimeFor(accountId);
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
    return continueDeathMove(accountId, selectedParty(accountId));
  }
  const reviving = party.filter((hero) => deathState(hero) === "death" && Number(hero.actionState) === 3);
  if (reviving.length) {
    state.deathMovePhase = null;
    state.deathRecoveryPhase = true;
    log("偵測到既有一般重生行動；依目前角色狀態接續重生", accountId);
    return continueDeathRecovery(accountId);
  }
  if (party.some((hero) => Number(hero.actionState) !== 0)) throw new Error("出戰角色有未識別行動；已停止死亡復原流程，請重新讀取確認");
  const location = partyLocation(party);
  if (!location) throw new Error("出戰角色位置不一致；已停止死亡復原流程，請重新讀取確認");
  if (location.zone === 0 && location.stage === 0) {
    state.deathMovePhase = null;
    state.deathRecoveryPhase = true;
    log("死亡復原流程：已在初始之鎮，開始依角色狀態重生／轉生", accountId);
    return continueDeathRecovery(accountId);
  }
  state.deathMovePhase = "to-town";
  await beginDeathMove(accountId, 0, "返回城鎮");
  scheduleDeathMove(accountId, selectedParty(accountId), "已送出返回城鎮");
  return true;
}
function scheduleHuntMove(accountId, party, reason) {
  const dueAt = Math.max(...party.map((hero) => Date.parse(hero.actionCompleteTime || 0) || 0), 0);
  const delay = dueAt > Date.now() ? dueAt - Date.now() + 2000 : 30000;
  log(`${reason}；依伺服器完成時間等待約 ${Math.ceil(delay / 1000)} 秒後完成移動`, accountId);
  schedule(delay, accountId);
}
async function beginHuntMoveToGrassland(accountId) {
  const state = runtimeFor(accountId);
  const result = await request("/move/1", { method: "POST" }, accountId);
  state.heroes = mergeHeroes(state.heroes, result.heroes);
  state.huntMovePhase = "to-grassland";
  await refreshAccount(accountId, { quiet: true });
  const party = selectedParty(accountId);
  if (!party.length || !party.every((hero) => Number(hero.actionState) === 1)) throw new Error("前往大草原請求後，出戰隊伍未進入移動狀態；已停止避免重複送出");
  log("自動狩獵：已從初始之鎮開始前往大草原", accountId);
  scheduleHuntMove(accountId, party, "前往大草原中");
}
async function continueHuntMove(accountId, party) {
  const state = runtimeFor(accountId);
  const moving = party.filter((hero) => Number(hero.actionState) === 1);
  if (moving.length) {
    if (moving.length !== party.length) throw new Error("出戰角色移動狀態不一致；已停止自動導航，請檢查遊戲狀態");
    if (!moving.every((hero) => hero.canComplete === true)) {
      scheduleHuntMove(accountId, moving, "前往大草原中");
      return;
    }
    const result = await request("/move/complete", { method: "POST" }, accountId);
    state.heroes = mergeHeroes(state.heroes, result.heroes);
    await refreshAccount(accountId);
  }
  const currentParty = selectedParty(accountId);
  if (currentParty.every((hero) => Number(hero.huntZone) === 1 && Number(hero.huntStage) === 1 && Number(hero.actionState) === 0)) {
    state.huntMovePhase = null;
    log("自動狩獵：已抵達大草原第 1 層，開始檢查狩獵條件", accountId);
    schedule(1000, accountId);
    return;
  }
  if (currentParty.every((hero) => Number(hero.huntZone) === 0 && Number(hero.huntStage) === 0 && Number(hero.actionState) === 0)) {
    await beginHuntMoveToGrassland(accountId);
    return;
  }
  throw new Error("前往大草原完成後位置或行動狀態不符；已停止自動流程，請重新讀取確認");
}
function partyVitalsValid(party) {
  return party.every((hero) => typeof hero.hp === "number" && typeof hero.sp === "number" && typeof hero.fullHp === "number" && hero.fullHp > 0 && typeof hero.fullSp === "number" && hero.fullSp > 0 && typeof hero.perished === "boolean" && Number.isInteger(hero.actionState));
}
function pct(current, max) { return max > 0 ? current / max * 100 : 0; }
function needsRest(c, accountId) { return selectedParty(accountId).some((hero) => pct(hero.hp, hero.fullHp) < c.hp || pct(hero.sp, hero.fullSp) < c.sp); }
function restComplete(c, accountId) { return selectedParty(accountId).every((hero) => pct(hero.hp, hero.fullHp) >= c.restHp && pct(hero.sp, hero.fullSp) >= c.restSp); }
function recoveryKinds(hero, c) {
  const lowHp = pct(hero.hp, hero.fullHp) < c.restHp;
  const lowSp = pct(hero.sp, hero.fullSp) < c.restSp;
  if (lowHp && lowSp) return ["both", "hp", "sp"];
  if (lowHp) return ["hp", "both"];
  if (lowSp) return ["sp", "both"];
  return [];
}
function configuredRecoveryItem(hero, c, accountId) {
  const own = c.heroItems?.[String(hero.id)] || {};
  const team = c.teamItems || {};
  const kinds = recoveryKinds(hero, c);
  if (!runtimeFor(accountId).recoveryFallbackHeroes.has(String(hero.id))) {
    for (const kind of kinds) {
      const ownId = own[kind];
      const ownItem = ownId ? itemById(ownId, accountId) : null;
      if (ownItem && itemQuantity(ownItem) > 0) return { item: ownItem, source: "hero", kind };
    }
  }
  for (const kind of kinds) {
    const teamId = team[kind];
    const teamItem = teamId ? itemById(teamId, accountId) : null;
    if (teamItem && itemQuantity(teamItem) > 0) return { item: teamItem, source: "team", kind, fallback: kinds.some((candidate) => Boolean(own[candidate])) };
  }
  return null;
}
function recoveryNeedText(hero, c) {
  const parts = [];
  if (pct(hero.hp, hero.fullHp) < c.restHp) parts.push(`HP ${Math.floor(pct(hero.hp, hero.fullHp))}%`);
  if (pct(hero.sp, hero.fullSp) < c.restSp) parts.push(`SP ${Math.floor(pct(hero.sp, hero.fullSp))}%`);
  return parts.join("／");
}
function recoveryUnavailableReason(hero, c, accountId) {
  const own = c.heroItems?.[String(hero.id)] || {};
  const team = c.teamItems || {};
  const ids = recoveryKinds(hero, c).flatMap((kind) => [own[kind], team[kind]]).filter(Boolean);
  if (!ids.length) return "未設定適用補品";
  const allItems = runtimeFor(accountId).items;
  if (ids.some((id) => allItems.some((item) => String(item.id) === String(id) && !isSafeRecoveryItem(item)))) return "設定補品不符合安全規則";
  if (ids.some((id) => allItems.some((item) => String(item.id) === String(id) && itemQuantity(item) <= 0))) return "適用補品已用完";
  return "沒有可用補品";
}
async function tryUseRecoveryItems(c, accountId) {
  if (!c.useItems || !runtimeFor(accountId).itemRecoveryActive || restComplete(c, accountId)) return false;
  const state = runtimeFor(accountId);
  const interceptItemRecoveryIssue = shouldInterceptItemRecoveryIssue(c);
  if (!state.itemsUpdatedAt || Date.now() - state.itemsUpdatedAt > 15000) await refreshItems(accountId);
  let used = false;
  for (const hero of selectedParty(accountId)) {
    if (!recoveryKinds(hero, c).length) continue;
    const choice = configuredRecoveryItem(hero, c, accountId);
    if (!choice) {
      log(`${hero.name} ${recoveryNeedText(hero, c)}，${recoveryUnavailableReason(hero, c, accountId)}，已自動進入休息`, accountId);
      return false;
    }
    const before = { hp: hero.hp, sp: hero.sp, quantity: itemQuantity(choice.item) };
    const beforeItem = itemRecoverySnapshot(choice.item);
    const beforeHero = heroRecoverySnapshot(hero);
    let result;
    try { result = await request(`/items/${encodeURIComponent(choice.item.id)}/use`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quantity: 1, heroId: hero.id }) }, accountId); }
    catch (error) {
      if (!interceptItemRecoveryIssue) {
        log(`${hero.name} 使用 ${choice.item.name} 的請求結果未確認；未啟用補品異常攔截，下一輪重新讀取後繼續`, accountId);
        return true;
      }
      const requestWasAborted = error?.name === "AbortError" || /aborted a request/i.test(String(error?.message || error));
      if (requestWasAborted) {
        const stopReason = state.stopReason;
        try {
          const verifiedItems = await refreshItems(accountId);
          const verifiedItem = (verifiedItems || []).find((item) => String(item.id) === String(choice.item.id));
          if (classifyAbortedItemUse({ beforeQuantity: before.quantity, verifiedQuantity: verifiedItem ? itemQuantity(verifiedItem) : null }) === "consumed") {
            try { await refresh(accountId); } catch { /* Back-pack evidence is sufficient; the normal next cycle refreshes heroes again. */ }
            createItemRecoveryIncident(accountId, "aborted-request-resolved", "補品請求中止，但重新讀取背包確認已消耗", { item: { itemId: beforeItem.itemId, before: beforeItem, verified: itemRecoverySnapshot(verifiedItem) }, hero: { before: beforeHero, after: heroRecoverySnapshot((runtimeFor(accountId).heroes || []).find((entry) => String(entry.id) === String(hero.id))) }, error: String(error.message || error).slice(0, 160), stopReason: stopReason || null }, { status: "resolved", verify: false });
            if (!state.running && shouldResumeAfterAbortedItemUse(stopReason)) {
              state.running = true; state.stopReason = null;
              state.watchdog = setInterval(() => {
                const settings = config(accountId);
                if (state.running && state.nextWakeAt && Date.now() > state.nextWakeAt + settings.alertMinutes * 60000) stopRunner(accountId, "超過無動作提醒時間，已停止");
              }, 30000);
              renderAccounts();
            }
            log(`${hero.name} 使用 ${choice.item.name} 的請求中止，但重新讀取背包確認已消耗；${state.running ? "繼續補品流程" : "依停止原因不自動恢復"}`, accountId);
            return true;
          }
        } catch { /* Preserve the original aborted-request evidence below; never resend a consumable request. */ }
      }
      createItemRecoveryIncident(accountId, "use-request-failed", "使用補品 API 請求失敗", { item: { itemId: beforeItem.itemId, before: beforeItem, response: null }, hero: { before: beforeHero, after: null }, error: String(error.message || error).slice(0, 160) });
      log(`${hero.name} 使用 ${choice.item.name} 失敗，已自動進入休息：${error.message || error}`, accountId); return false;
    }
    const updatedItems = normalizeItems(result.items);
    if (!updatedItems) {
      if (!interceptItemRecoveryIssue) return true;
      createItemRecoveryIncident(accountId, "inventory-missing", "使用補品成功回應未包含可辨識背包資料", { item: { itemId: beforeItem.itemId, before: beforeItem, response: null }, hero: { before: beforeHero, after: heroRecoverySnapshot(result.hero) } });
      log(`${hero.name} 使用 ${choice.item.name} 後未回傳可辨識的背包資料，已自動進入休息`, accountId); return false;
    }
    state.items = updatedItems; state.itemsUpdatedAt = Date.now();
    const account = accounts.find((entry) => entry.id === accountId);
    if (account) { account.itemCatalog = state.items; account.itemsUpdatedAt = state.itemsUpdatedAt; save(); }
    const updatedHero = result.hero;
    if (!updatedHero) {
      if (!interceptItemRecoveryIssue) return true;
      createItemRecoveryIncident(accountId, "hero-missing", "使用補品成功回應未包含角色資料", { item: { itemId: beforeItem.itemId, before: beforeItem, response: itemRecoverySnapshot((updatedItems || []).find((item) => String(item.id) === String(choice.item.id))) }, hero: { before: beforeHero, after: null } });
      log(`${hero.name} 使用 ${choice.item.name} 後未回傳角色資料，已自動進入休息`, accountId); return false;
    }
    state.heroes = mergeHeroes(state.heroes, [updatedHero]);
    let afterItem = itemById(choice.item.id, accountId);
    let afterQuantity = afterItem ? itemQuantity(afterItem) : 0;
    if (afterQuantity >= before.quantity) {
      if (!interceptItemRecoveryIssue) return true;
      await refreshItems(accountId);
      afterItem = itemById(choice.item.id, accountId);
      afterQuantity = afterItem ? itemQuantity(afterItem) : 0;
      if (afterQuantity >= before.quantity) {
        if (choice.source === "hero") {
          state.recoveryFallbackHeroes.add(String(hero.id));
          const fallback = configuredRecoveryItem(hero, c, accountId);
          if (fallback?.source === "team") { log(`${hero.name} 使用 ${choice.item.name} 未確認，下一輪改用全隊預設補品 ${fallback.item.name}`, accountId); return true; }
          state.recoveryFallbackHeroes.delete(String(hero.id));
        }
        createItemRecoveryIncident(accountId, "inventory-not-decreased", "補品使用後重新讀取背包，庫存仍未減少", { item: { itemId: beforeItem.itemId, before: beforeItem, response: itemRecoverySnapshot((updatedItems || []).find((item) => String(item.id) === String(choice.item.id))), refresh: itemRecoverySnapshot(afterItem) }, hero: { before: beforeHero, after: heroRecoverySnapshot(updatedHero) } });
        log(`${hero.name} 使用 ${choice.item.name} 後庫存未減少；重新讀取背包後仍未扣除，已自動進入休息`, accountId); return false;
      }
    }
    if (Number(updatedHero.hp) <= before.hp && Number(updatedHero.sp) <= before.sp) {
      if (!interceptItemRecoveryIssue) return true;
      createItemRecoveryIncident(accountId, "vitals-not-increased", "補品庫存已消耗但 HP／SP 未增加", { item: { itemId: beforeItem.itemId, before: beforeItem, response: itemRecoverySnapshot(afterItem) }, hero: { before: beforeHero, after: heroRecoverySnapshot(updatedHero) } });
      log(`${hero.name} 使用 ${choice.item.name} 後 HP／SP 未增加，已自動進入休息`, accountId); return false;
    }
    operation(accountId, "item.used", { heroId: hero.id, heroName: hero.name, itemId: choice.item.id, itemName: choice.item.name, source: choice.source, fallback: choice.fallback === true, before, after: { hp: updatedHero.hp, sp: updatedHero.sp, quantity: afterQuantity } });
    const fallbackText = choice.fallback ? "；指定補品不可用，已改用全隊預設" : choice.source === "team" ? "；使用全隊預設" : "";
    log(`${hero.name} 使用 ${choice.item.name} × 1${fallbackText}`, accountId);
    state.recoveryFallbackHeroes.delete(String(hero.id));
    used = true;
  }
  if (accountId === activeId) { renderHeroes(accountId); renderItemSettings(accountId); }
  return used;
}
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
  state.running = false; state.stopReason = reason;
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
    state.canForward = info.canForward ?? state.canForward; state.cooldownAt = localCooldownAt(info.huntAvailableAt, state) || state.cooldownAt;
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
    state.cooldownAt = localCooldownAt(info.huntAvailableAt, state) || state.cooldownAt;
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
    await refreshAccount(accountId, { quiet: true });
    if (!restComplete(c, accountId)) {
      const summary = selectedParty(accountId).map((hero) => `${hero.name} HP ${Math.floor(pct(hero.hp, hero.fullHp))}%／SP ${Math.floor(pct(hero.sp, hero.fullSp))}%`).join("；");
      log(`休息尚未達成 HP ${c.restHp}%／SP ${c.restSp}%：${summary}；繼續休息`, accountId);
      await rest(c, accountId);
      return;
    }
    state.itemRecoveryActive = false; state.recoveryFallbackHeroes.clear();
    if (accountId === activeId) renderHeroes(accountId);
    log(`已完成休息，全隊達到 HP ${c.restHp}%／SP ${c.restSp}%`, accountId); schedule(1000, accountId); return;
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
  if (!partyVitalsValid(party)) throw new Error("出戰角色 HP／SP 或行動狀態無效，已停止");
  if (party.some((hero) => Number(hero.actionState) !== 0 || hero.perished || hero.hp <= 0)) throw new Error("出戰隊伍尚未全員空閒且存活；禁止開始狩獵");
  if (needsRest(c, accountId)) throw new Error("出戰角色未達 HP／SP 目標；禁止開始狩獵");
  const atTown = party.every((hero) => Number(hero.huntZone) === 0 && Number(hero.huntStage) === 0);
  const atGrassland = party.every((hero) => Number(hero.huntZone) === 1 && Number(hero.huntStage) >= 1);
  if (atTown) {
    await beginHuntMoveToGrassland(accountId);
    return;
  }
  if (!atGrassland) throw new Error("出戰隊伍不在已驗證的狩獵地圖或位置不一致；請重新讀取確認");
  const cooldownWaitMs = state.cooldownAt - Date.now();
  if (cooldownWaitMs > 0) {
    debug(accountId, "hunt.cooldown", { cooldownAt: new Date(state.cooldownAt).toISOString(), waitMs: cooldownWaitMs });
    return schedule(cooldownWaitMs, accountId);
  }
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
  state.cooldownAt = localCooldownAt(result.huntInfo?.huntAvailableAt, state);
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
    debug(accountId, "runner.turn", { config: c, party: partyDebug(party), deathMovePhase: state.deathMovePhase, deathRecoveryPhase: state.deathRecoveryPhase, huntMovePhase: state.huntMovePhase });
    if (state.deathMovePhase) { operation(accountId, "runner.branch", { branch: "death-move" }); debug(accountId, "runner.branch", { branch: "death-move" }); await continueDeathMove(accountId, party); return; }
    if (state.deathRecoveryPhase) { operation(accountId, "runner.branch", { branch: "death-recovery" }); debug(accountId, "runner.branch", { branch: "death-recovery" }); await continueDeathRecovery(accountId); return; }
    if (party.some((hero) => deathState(hero))) { operation(accountId, "runner.branch", { branch: "death-detected" }); debug(accountId, "runner.branch", { branch: "death-detected" }); await continueDeathMove(accountId, party); return; }
    if (state.huntMovePhase) { operation(accountId, "runner.branch", { branch: "hunt-move" }); debug(accountId, "runner.branch", { branch: "hunt-move" }); await continueHuntMove(accountId, party); return; }
    if (party.every((hero) => Number(hero.actionState) === 1 && Number(hero.huntZone) === 0 && Number(hero.huntStage) === 0)) {
      state.huntMovePhase = "to-grassland";
      operation(accountId, "runner.branch", { branch: "hunt-move-resume" });
      log("偵測到既有前往大草原移動；接續完成導航", accountId);
      await continueHuntMove(accountId, party);
      return;
    }
    if (party.some((hero) => Number(hero.actionState) === 2)) { operation(accountId, "runner.branch", { branch: "rest-existing" }); debug(accountId, "runner.branch", { branch: "rest-existing" }); await rest(c, accountId); return; }
    if (party.some((hero) => Number(hero.actionState) !== 0)) throw new Error("勾選出戰隊伍有移動或未識別行動；請先完成並重新讀取");
    if (needsRest(c, accountId)) state.itemRecoveryActive = true;
    if (state.itemRecoveryActive && restComplete(c, accountId)) {
      state.itemRecoveryActive = false; state.recoveryFallbackHeroes.clear();
      log(`補品恢復完成，全隊達到 HP ${c.restHp}%／SP ${c.restSp}%`, accountId);
    }
    if (state.itemRecoveryActive) {
      if (c.useItems) {
        operation(accountId, "runner.branch", { branch: "item-recovery" });
        debug(accountId, "runner.branch", { branch: "item-recovery" });
        const used = await tryUseRecoveryItems(c, accountId);
        if (used) { schedule(1000, accountId); return; }
      }
      operation(accountId, "runner.branch", { branch: "rest-needed" }); debug(accountId, "runner.branch", { branch: "rest-needed" }); await rest(c, accountId);
    }
    else { operation(accountId, "runner.branch", { branch: "hunt" }); debug(accountId, "runner.branch", { branch: "hunt" }); await hunt(c, accountId); }
  } catch (error) {
    if (error.name !== "AbortError" && error.statusCode === 403 && error.responseBody?.code === "CAPTCHA_REQUIRED") {
      const challengeId = Number(error.responseBody.challengeId);
      if (Number.isFinite(challengeId)) {
        log(`偵測到活人驗證要求（挑戰 ${challengeId}）；正在自動完成`, accountId);
        try {
          const verify = await request("/captcha/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challengeId, checked: true }) }, accountId);
          if (verify?.ok !== true) throw new Error("活人驗證回應異常");
          log(`已自動完成活人驗證（挑戰 ${challengeId}）`, accountId);
          if (state.running) schedule(1000, accountId);
          return;
        } catch (captchaError) {
          if (captchaError.name !== "AbortError") log(`活人驗證失敗：${captchaError.message || captchaError}`, accountId);
        }
      }
    }
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
  state.running = true; state.stopReason = null; state.restUntil = 0; state.recoveryFallbackHeroes.clear();
  operation(accountId, "runner.started", { version: uiVersion, targetStage: c.target, hpTarget: c.hp, spTarget: c.sp });
  debug(accountId, "runner.started", { config: c });
  if (accountId === activeId) { $("alert").hidden = true; document.title = "Autoy"; setState(null, accountId); }
  state.watchdog = setInterval(() => {
    const settings = config(accountId);
    if (state.running && state.nextWakeAt && Date.now() > state.nextWakeAt + settings.alertMinutes * 60000) stopRunner(accountId, "超過無動作提醒時間，已停止");
  }, 30000);
  renderAccounts(); log("開始此帳號自動狩獵；先檢查出戰名單與目前行動", accountId); turn(accountId);
}
function stopAll() {
  const runningAccounts = accounts.filter((account) => runtimeFor(account.id).running);
  if (!runningAccounts.length) { warn("目前沒有運行中的帳號"); return; }
  if (!window.confirm(`確定停止全部 ${runningAccounts.length} 個運行中的帳號嗎？`)) return;
  for (const account of runningAccounts) stopRunner(account.id, "已由停止全部帳號結束");
  log(`已停止全部 ${runningAccounts.length} 個運行中的帳號`);
}
async function copyText(text, successMessage, accountId = activeId) {
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
    log(successMessage, accountId);
  } catch (error) {
    warn(`複製失敗：${error.message || error}`, accountId);
  }
}
function openDialog(id) {
  const dialog = $(id);
  if (dialog && !dialog.open) dialog.showModal();
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
  $("refresh").onclick = () => Promise.all([refreshAccount(activeId, { quiet: true }), refreshItems(activeId), refreshForgeData(activeId).catch((error) => warn(`鍛造資料讀取失敗：${error.message || error}`, activeId))]).then(() => { if (!stopForDeaths(activeId)) { $("alert").hidden = true; log("角色、狩獵狀態與補品背包已更新"); } }).catch((error) => warn(`重新讀取失敗：${error.message || error}`, activeId));
  $("start").onclick = () => startRunner(activeId);
  $("stop").onclick = () => stopRunner(activeId);
  const stopAllButton = $("stop-all"); if (stopAllButton) stopAllButton.onclick = stopAll;
  $("clear-events").onclick = () => { const state = runtimeFor(activeId); state.messages = []; renderFlowMessages(activeId); };
  $("copy-events").onclick = () => copyText($("events").textContent, "流程訊息已複製");
  $("clear-operations").onclick = () => { const state = runtimeFor(activeId); state.operations = []; renderOperations(activeId); };
  $("copy-operations").onclick = () => copyText(JSON.stringify(runtimeFor(activeId).operations, null, 2), "操作紀錄 JSON 已複製");
  $("open-flow").onclick = () => { renderFlowMessages(activeId); openDialog("flow-card"); };
  $("open-operations").onclick = () => { renderOperations(activeId); openDialog("operation-card"); };
  $("open-item-recovery-incidents").onclick = () => { renderItemRecoveryIncidents(); openDialog("item-recovery-incidents"); };
  $("copy-item-recovery-incidents").onclick = () => copyText(JSON.stringify(itemRecoveryIncidents.filter((entry) => entry.accountRef === String(activeId)), null, 2), "補品異常 JSON 已複製");
  $("clear-item-recovery-incidents").onclick = () => {
    if (!window.confirm("只會清除目前帳號的補品異常紀錄，不影響帳號、補品設定或操作紀錄。確定清除？")) return;
    itemRecoveryIncidents = itemRecoveryIncidents.filter((entry) => entry.accountRef !== String(activeId)); saveItemRecoveryIncidents(); renderItemRecoveryIncidents();
  };

  $("open-forge-debug").onclick = () => { renderForgeDebugLogs(); openDialog("forge-debug-dialog"); };
  $("copy-forge-debug").onclick = () => copyText(JSON.stringify(forgeDebugLogs.filter((entry) => entry.accountRef === String(activeId)), null, 2), "鍛造除錯 JSON 已複製");
  $("clear-forge-debug").onclick = () => {
    if (!window.confirm("只會清除目前帳號的鍛造除錯紀錄，不影響鍛造設定、補品設定或自動狩獵。確定清除？")) return;
    forgeDebugLogs = forgeDebugLogs.filter((entry) => entry.accountRef !== String(activeId)); saveForgeDebugLogs(); renderForgeDebugLogs();
  };
  $("open-reports").onclick = () => { renderReports(activeId); openDialog("reports-dialog"); };
  $("refresh-reports").onclick = () => loadReports(activeId).catch((error) => warn(`讀取戰報列表失敗：${error.message || error}`, activeId));
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.onclick = () => button.closest("dialog")?.close());
  for (const id of ["target-stage", "hp-target", "sp-target", "rest-hp-target", "rest-sp-target", "rest-minutes", "alert-minutes", "flow-messages", "operation-log", "debug-console", "item-recovery-incident-enabled", "forge-debug-enabled"]) $(id).addEventListener("change", () => {
    persistSettings();
    if (id === "flow-messages" && $("flow-messages").checked) log("已啟用流程訊息", activeId);
    if (id === "operation-log" && $("operation-log").checked) operation(activeId, "operation-log.enabled", { message: "使用者啟用操作紀錄" });
    if (id === "forge-debug-enabled" && $("forge-debug-enabled").checked) recordForgeDebug(activeId, "debug.enabled", { message: "使用者啟用鍛造除錯紀錄" });
    renderFlowMessages(activeId); renderOperations(activeId);
  });
}
function init() {
  initAccountEvents();
  if (active()) loadSettings();
  render();
  if (active()) loadAccountSnapshot(activeId);
  for (const account of accounts) if (account.settings?.forgeEnabled === true) setForgeEnabled(account.id, true);
}
init();
