// ==UserScript==
// @name         Autoy 半自動登入切換器
// @namespace    https://github.com/jackyliRx/swordgale-autoy
// @version      1.1.1
// @description  儲存帳號別名與使用者名稱，協助填入登入帳號；密碼、驗證碼與 Cookie 一律不保存。
// @match        https://myteam.swordgale.online/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  "use strict";

  const STORAGE_KEY = "autoy.accountSwitcher.accounts.v1";
  const LOGIN_PATH = "/login";
  const PANEL_ID = "autoy-account-switcher";

  function normalizeAccounts(value) {
    if (!Array.isArray(value)) return [];
    const names = new Set();
    return value.reduce((result, item) => {
      const alias = String(item?.alias || "").trim().slice(0, 60);
      const username = String(item?.username || "").trim().slice(0, 254);
      if (!alias || !username || names.has(alias)) return result;
      names.add(alias);
      result.push({ id: String(item.id || crypto.randomUUID()), alias, username });
      return result;
    }, []);
  }

  async function loadAccounts() {
    try { return normalizeAccounts(await GM_getValue(STORAGE_KEY, [])); }
    catch { return []; }
  }

  async function saveAccounts(accounts) {
    await GM_setValue(STORAGE_KEY, normalizeAccounts(accounts));
  }

  // 以別名作為更新鍵；目前下拉選到另一筆時，輸入新別名仍會新增而不覆寫原帳號。
  function saveAccountEntry(accounts, { selectedId = "", alias, username, idFactory = () => crypto.randomUUID() }) {
    const normalizedAlias = String(alias || "").trim().slice(0, 60);
    const normalizedUsername = String(username || "").trim().slice(0, 254);
    if (!normalizedAlias || !normalizedUsername) return { accounts: normalizeAccounts(accounts), saved: null };
    const existingByAlias = accounts.find((account) => account.alias === normalizedAlias);
    const selectedWithSameAlias = accounts.find((account) => account.id === selectedId && account.alias === normalizedAlias);
    const id = existingByAlias?.id || selectedWithSameAlias?.id || idFactory();
    const saved = { id, alias: normalizedAlias, username: normalizedUsername };
    return {
      accounts: normalizeAccounts([...accounts.filter((account) => account.id !== id && account.alias !== normalizedAlias), saved]),
      saved,
    };
  }

  function findLoginFields() {
    const inputs = [...document.querySelectorAll("input")].filter((input) => !input.disabled && input.offsetParent !== null);
    const username = document.querySelector('input#email[type="email"]')
      || inputs.find((input) => input.autocomplete === "email" || input.autocomplete === "username")
      || inputs.find((input) => input.type === "email")
      || inputs.find((input) => /^(user(name)?|email|account|login|id)$/i.test(input.name || input.id || ""))
      || inputs.find((input) => ["text", ""].includes(input.type) && /user|email|account|login|會員|帳號/i.test(`${input.name} ${input.id} ${input.placeholder}`));
    const password = inputs.find((input) => input.type === "password");
    return { username, password, form: username?.form || password?.form || null };
  }

  function setNativeValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    input.focus();
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
    return input.value === value;
  }

  function isLoginPage() {
    return location.pathname === LOGIN_PATH || Boolean(findLoginFields().password);
  }

  function submitLogin() {
    const { username, password, form } = findLoginFields();
    if (!username || !password) return { ok: false, message: "找不到登入帳號或密碼欄位；請先開啟官方登入頁。" };
    if (!username.value.trim()) return { ok: false, message: "請先選擇帳號並填入使用者名稱。" };
    if (!password.value) return { ok: false, message: "請使用瀏覽器密碼管理器填入密碼後，再按登入。" };
    const submit = form?.querySelector('button[type="submit"], input[type="submit"]');
    if (submit) submit.click();
    else if (form?.requestSubmit) form.requestSubmit();
    else return { ok: false, message: "找不到登入按鈕；請手動按官方登入按鈕。" };
    return { ok: true, message: "已送出官方登入表單；若出現驗證碼、OTP 或裝置核准，請手動完成。" };
  }

  function clearSiteLocalStorage() {
    localStorage.clear();
    location.assign(LOGIN_PATH);
  }

  function mount() {
    if (document.querySelector(`#${PANEL_ID}`)) return;
    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.innerHTML = `<style>
      #${PANEL_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:300px;background:#17202a;color:#edf2f7;border:1px solid #526273;border-radius:10px;box-shadow:0 12px 36px #0009;font:13px/1.45 system-ui,sans-serif;padding:10px}
      #${PANEL_ID} .head{display:flex;justify-content:space-between;align-items:center;cursor:move;margin-bottom:7px} #${PANEL_ID} h2{font-size:14px;margin:0} #${PANEL_ID} label{display:block;margin:6px 0 2px} #${PANEL_ID} input,#${PANEL_ID} select,#${PANEL_ID} button{box-sizing:border-box;font:inherit} #${PANEL_ID} input,#${PANEL_ID} select{width:100%;padding:6px;border:1px solid #526273;border-radius:5px;background:#0f151c;color:inherit} #${PANEL_ID} .row{display:flex;gap:6px;margin-top:8px} #${PANEL_ID} button{flex:1;border:1px solid #526273;border-radius:5px;padding:6px;background:#2d3c4c;color:inherit;cursor:pointer} #${PANEL_ID} .head button{flex:0 0 28px;width:28px;padding:2px 0} #${PANEL_ID} .danger{background:#8f3030} #${PANEL_ID} small{display:block;color:#b8c5d1;margin-top:8px} #${PANEL_ID} .status{min-height:2.8em;color:#b9d7f5}
    </style>
    <div class="head"><h2>Autoy 半自動登入</h2><button type="button" data-action="toggle" aria-label="收合或展開">−</button></div>
    <div class="body">
      <label>已儲存帳號<select data-field="account"><option value="">選擇帳號</option></select></label>
      <div class="row"><button type="button" data-action="fill">填入帳號</button><button type="button" data-action="login">登入</button></div>
      <label>帳號別名<input data-field="alias" maxlength="60" placeholder="例如：主帳號"></label>
      <label>使用者名稱／Email<input data-field="username" maxlength="254" autocomplete="username" placeholder="不保存密碼"></label>
      <div class="row"><button type="button" data-action="save">新增／更新帳號</button><button type="button" data-action="delete">刪除帳號</button></div>
      <div class="row"><button type="button" class="danger" data-action="logout">登出並清除本站 Local Storage</button></div>
      <small class="status" data-field="status"></small>
      <small>只保存別名與使用者名稱。密碼、Cookie、驗證碼與 OTP 不會保存；請交給瀏覽器密碼管理器與官方驗證流程。</small>
    </div>`;
    document.body.appendChild(panel);

    const accountSelect = panel.querySelector('[data-field="account"]');
    const aliasInput = panel.querySelector('[data-field="alias"]');
    const usernameInput = panel.querySelector('[data-field="username"]');
    const status = panel.querySelector('[data-field="status"]');
    let accounts = [];
    const show = (message) => { status.textContent = message; };
    const selected = () => accounts.find((account) => account.id === accountSelect.value) || null;
    const render = () => {
      const previous = accountSelect.value;
      accountSelect.replaceChildren(new Option("選擇帳號", ""), ...accounts.map((account) => new Option(account.alias, account.id)));
      accountSelect.value = accounts.some((account) => account.id === previous) ? previous : "";
    };
    const applySelected = () => {
      const account = selected();
      if (!account) return;
      aliasInput.value = account.alias;
      usernameInput.value = account.username;
    };

    accountSelect.addEventListener("change", applySelected);
    panel.addEventListener("click", async (event) => {
      const action = event.target.closest("button")?.dataset.action;
      if (!action) return;
      if (action === "toggle") {
        const body = panel.querySelector(".body");
        const hidden = body.hidden = !body.hidden;
        event.target.textContent = hidden ? "+" : "−";
        return;
      }
      if (action === "fill") {
        const account = selected();
        const { username } = findLoginFields();
        if (!account) return show("請先選擇已儲存帳號。");
        if (!username) return show("找不到登入帳號欄位；請先開啟官方登入頁。" );
        if (!setNativeValue(username, account.username)) return show("帳號欄位拒絕更新；請手動填入後再使用瀏覽器密碼管理器。" );
        show(`已填入「${account.alias}」；請讓瀏覽器填入密碼。`);
        return;
      }
      if (action === "login") {
        const result = submitLogin();
        show(result.message);
        return;
      }
      if (action === "save") {
        const alias = aliasInput.value.trim();
        const username = usernameInput.value.trim();
        if (!alias || !username) return show("別名與使用者名稱皆為必填。" );
        const result = saveAccountEntry(accounts, { selectedId: selected()?.id, alias, username });
        accounts = result.accounts;
        await saveAccounts(accounts);
        render(); accountSelect.value = "";
        aliasInput.value = ""; usernameInput.value = "";
        show(`已儲存「${alias}」；已重設為「選擇帳號」，可直接新增下一筆。未保存密碼。`);
        return;
      }
      if (action === "delete") {
        const account = selected();
        if (!account) return show("請先選擇要刪除的帳號。" );
        if (!confirm(`刪除「${account.alias}」的別名與使用者名稱？不影響瀏覽器密碼管理器。`)) return;
        accounts = accounts.filter((item) => item.id !== account.id);
        await saveAccounts(accounts);
        render(); aliasInput.value = ""; usernameInput.value = "";
        show("已刪除帳號資料。");
        return;
      }
      if (action === "logout") {
        if (!confirm("這會清除 myteam.swordgale.online 的所有 Local Storage，並返回登入頁。Tampermonkey 保存的帳號別名不會刪除；HTTP-only Cookie 無法由外掛清除。要繼續嗎？")) return;
        clearSiteLocalStorage();
      }
    });

    let drag = null;
    panel.querySelector(".head").addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      panel.setPointerCapture(event.pointerId);
    });
    panel.addEventListener("pointermove", (event) => {
      if (!drag) return;
      panel.style.left = `${Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, event.clientX - drag.dx))}px`;
      panel.style.top = `${Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, event.clientY - drag.dy))}px`;
      panel.style.right = "auto"; panel.style.bottom = "auto";
    });
    panel.addEventListener("pointerup", () => { drag = null; });

    loadAccounts().then((loaded) => { accounts = loaded; render(); show(isLoginPage() ? "登入頁已偵測；選擇帳號後可填入。" : "目前非登入頁；可管理帳號或清除本站 Local Storage。" ); });
  }

  if (typeof window !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
    else mount();
  }

  if (typeof globalThis !== "undefined" && globalThis.__AUTOY_ACCOUNT_SWITCHER_TEST__) {
    globalThis.__AUTOY_ACCOUNT_SWITCHER_TEST_API__ = { normalizeAccounts, saveAccountEntry };
  }
})();
