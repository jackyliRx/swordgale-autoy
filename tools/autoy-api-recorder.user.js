// ==UserScript==
// @name         Autoy API Recorder
// @namespace    https://github.com/jackyliRx/swordgale-autoy
// @version      1.0.0
// @description  Record Swordgale API request and response pairs for Autoy debugging.
// @match        https://myteam.swordgale.online/*
// @run-at       document-start
// @grant        none
// @sandbox       raw
// ==/UserScript==

(() => {
  "use strict";

  const API_PREFIX = `${location.origin}/api/`;
  const ENABLED_KEY = "autoy.apiRecorder.enabled";
  const LOG_KEY = "autoy.apiRecorder.logs";
  const MAX_LOGS = 100;
  const MAX_TEXT = 30000;
  let enabled = localStorage.getItem(ENABLED_KEY) === "true";
  let logs = loadLogs();

  function loadLogs() {
    try { const value = JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); return Array.isArray(value) ? value : []; }
    catch { return []; }
  }
  function persist() {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); }
    catch {
      logs = logs.slice(0, 30);
      try { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); } catch { /* Storage is unavailable; keep the in-memory trace. */ }
    }
  }
  function isApi(url) { return String(url).startsWith(API_PREFIX); }
  function redact(value, depth = 0) {
    if (depth > 8) return "[truncated: depth]";
    if (value === null || ["number", "boolean"].includes(typeof value)) return value;
    if (typeof value === "string") return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…[truncated]` : value;
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => redact(item, depth + 1));
    if (typeof value === "object") {
      const result = {};
      for (const [key, item] of Object.entries(value).slice(0, 100)) result[key] = /token|authorization|cookie|password|secret|api[_-]?key/i.test(key) ? "[redacted]" : redact(item, depth + 1);
      return result;
    }
    return String(value);
  }
  function parseBody(value) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "string") { try { return redact(JSON.parse(value)); } catch { return redact(value); } }
    if (value instanceof FormData) return "[FormData omitted]";
    return redact(value);
  }
  function parseHeaders(value) {
    if (!value) return {};
    const result = {};
    new Headers(value).forEach((headerValue, key) => { result[key] = /token|authorization|cookie|password|secret|api[_-]?key/i.test(key) ? "[redacted]" : headerValue; });
    return result;
  }
  function add(entry) {
    if (!enabled) return;
    logs.unshift({ at: new Date().toISOString(), ...entry });
    logs.splice(MAX_LOGS);
    persist();
    render();
  }
  function newId() { return crypto.randomUUID(); }

  const originalFetch = window.fetch;
  window.fetch = async function autoyRecordedFetch(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const url = request?.url || new URL(typeof input === "string" ? input : input.url, location.href).href;
    const method = (init.method || request?.method || "GET").toUpperCase();
    const requestId = newId();
    const started = performance.now();
    const requestBody = parseBody(init.body);
    const requestHeaders = parseHeaders(init.headers || request?.headers);
    if (isApi(url)) add({ event: "request", requestId, source: "fetch", method, url, requestBody, requestHeaders });
    try {
      const response = await originalFetch.apply(this, arguments);
      if (isApi(url)) response.clone().text().then((text) => add({ event: "response", requestId, source: "fetch", method, url, status: response.status, ok: response.ok, durationMs: Math.round(performance.now() - started), responseBody: parseBody(text) })).catch((error) => add({ event: "response-read-error", requestId, source: "fetch", method, url, message: String(error?.message || error) }));
      return response;
    } catch (error) {
      if (isApi(url)) add({ event: "network-error", requestId, source: "fetch", method, url, durationMs: Math.round(performance.now() - started), message: String(error?.message || error) });
      throw error;
    }
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function autoyRecordedOpen(method, url) {
    this.__autoyRecorder = { method: String(method || "GET").toUpperCase(), url: new URL(url, location.href).href, headers: {}, requestId: newId() };
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function autoyRecordedHeader(key, value) {
    if (this.__autoyRecorder) this.__autoyRecorder.headers[key] = /token|authorization|cookie|password|secret|api[_-]?key/i.test(key) ? "[redacted]" : String(value);
    return originalSetRequestHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function autoyRecordedSend(requestBody) {
    const info = this.__autoyRecorder;
    if (!info || !isApi(info.url)) return originalSend.apply(this, arguments);
    const started = performance.now();
    add({ event: "request", requestId: info.requestId, source: "xhr", method: info.method, url: info.url, requestBody: parseBody(requestBody), requestHeaders: redact(info.headers) });
    this.addEventListener("loadend", () => add({ event: "response", requestId: info.requestId, source: "xhr", method: info.method, url: info.url, status: this.status, ok: this.status >= 200 && this.status < 300, durationMs: Math.round(performance.now() - started), responseBody: parseBody(this.responseText) }), { once: true });
    return originalSend.apply(this, arguments);
  };

  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `autoy-api-recorder-${new Date().toISOString().replace(/[:.]/g, "-")}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(JSON.stringify(logs, null, 2)); notice("JSON 已複製"); }
    catch { notice("瀏覽器拒絕複製，請使用下載 JSON"); }
  }
  function notice(text) { const element = document.querySelector("#autoy-recorder-status"); if (element) element.textContent = text; }
  function render() {
    const checkbox = document.querySelector("#autoy-recorder-enabled");
    const count = document.querySelector("#autoy-recorder-count");
    const output = document.querySelector("#autoy-recorder-output");
    if (checkbox) checkbox.checked = enabled;
    if (count) count.textContent = `已記錄 ${logs.length} 筆事件`;
    if (output) output.textContent = logs.length ? JSON.stringify(logs, null, 2) : "啟用後操作遊戲，即會開始記錄 request 與 response。";
  }
  function mount() {
    if (document.querySelector("#autoy-api-recorder")) return;
    const panel = document.createElement("section");
    panel.id = "autoy-api-recorder";
    panel.innerHTML = `<style>
      #autoy-api-recorder{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(560px,calc(100vw - 32px));background:#17202a;color:#edf2f7;border:1px solid #526273;border-radius:10px;box-shadow:0 12px 36px #0009;font:13px/1.45 system-ui,sans-serif;padding:12px}
      #autoy-api-recorder h2{font-size:15px;margin:0} #autoy-api-recorder .top,#autoy-api-recorder .actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap} #autoy-api-recorder .top{justify-content:space-between} #autoy-api-recorder button{background:#2d3c4c;color:inherit;border:1px solid #526273;border-radius:6px;padding:6px 8px;cursor:pointer} #autoy-api-recorder .danger{background:#8f3030} #autoy-api-recorder pre{max-height:280px;overflow:auto;white-space:pre-wrap;background:#0f151c;padding:9px;border-radius:6px;margin:10px 0 0;color:#b9d7f5} #autoy-api-recorder small{color:#b8c5d1}
    </style><div class="top"><h2>Autoy API Recorder</h2><label><input id="autoy-recorder-enabled" type="checkbox"> 啟用紀錄</label></div><div class="actions"><span id="autoy-recorder-count"></span><button id="autoy-recorder-copy">複製 JSON</button><button id="autoy-recorder-download">下載 JSON</button><button id="autoy-recorder-clear" class="danger">清除</button></div><small id="autoy-recorder-status">token、Cookie、Authorization、密碼等欄位會遮罩。</small><pre id="autoy-recorder-output"></pre>`;
    document.body.appendChild(panel);
    panel.querySelector("#autoy-recorder-enabled").onchange = (event) => { enabled = event.target.checked; localStorage.setItem(ENABLED_KEY, String(enabled)); if (enabled) add({ event: "recorder-enabled", source: "tampermonkey" }); else notice("已停止記錄"); render(); };
    panel.querySelector("#autoy-recorder-copy").onclick = copy;
    panel.querySelector("#autoy-recorder-download").onclick = download;
    panel.querySelector("#autoy-recorder-clear").onclick = () => { logs = []; persist(); render(); notice("已清除"); };
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
})();
