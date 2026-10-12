# Plan：補品使用量最佳化 & 鍛造收取延遲修正

---

## 一、補品使用量最佳化

### 現狀

`tryUseRecoveryItems` 每次永遠送 `quantity: 1`。  
遊戲 API 支援 `quantity: 1` 或 `quantity: 10`，嚴格禁止其他數量。  
鍛造 SP 預充（`fillForgeHeroSp`）已有類似邏輯，但狩獵補品沒有。

### 目標

依每輪實際需求決定每次 API call 的 quantity（1 或 10），加快恢復速度。

### 使用規則（用量決策）

| neededItems | available ≥ 10？ | quantity |
|-------------|-----------------|----------|
| ≥ 10        | 是              | **10**   |
| ≥ 10        | 否              | **1**    |
| < 10        | -               | **1**    |

**嚴格限制：quantity 只能為 1 或 10，絕對不能出現其他值。**

#### 情境範例（單次 tryUseRecoveryItems 呼叫 × 輪次）

| 總需求 | 呼叫序列         | 說明                          |
|--------|-----------------|-------------------------------|
| 13 個  | 10×1 → 1×3     | 第1輪用10，之後3輪各用1       |
| 10 個  | 10×1           | 第1輪用10，完成                |
| 3 個   | 1×3            | 3 < 10，每輪用1，共3輪        |

（每輪 = 一次 hunt 週期呼叫一次 `tryUseRecoveryItems`）

### 計算邏輯

**新增 `calcUseQuantity(item, hero, c)` 函數**（`tryUseRecoveryItems` 內部）：

```js
function calcUseQuantity(item, hero, c) {
  const maxPerUse = 10; // 遊戲只允許 1 或 10
  const available  = itemQuantity(item);
  const hpGap = item.healHp > 0 ? Math.max(0, Math.ceil(hero.fullHp * c.restHp / 100) - hero.hp) : 0;
  const spGap = item.healSp > 0 ? Math.max(0, Math.ceil(hero.fullSp * c.restSp / 100) - hero.sp) : 0;
  const hpNeeded = item.healHp > 0 && hpGap > 0 ? Math.ceil(hpGap / item.healHp) : 0;
  const spNeeded = item.healSp > 0 && spGap > 0 ? Math.ceil(spGap / item.healSp) : 0;
  const needed   = Math.max(hpNeeded, spNeeded);
  return needed >= maxPerUse && available >= maxPerUse ? maxPerUse : 1;
}
```

### 修改位置（app.js）

| 位置 | 修改內容 |
|------|---------|
| `tryUseRecoveryItems` 正常路徑（~line 1659） | 送出前計算 `quantity = calcUseQuantity(...)` |
| `tryUseRecoveryItems` 重試路徑（~line 1686） | 同上，重試也使用相同 quantity |
| `tryUseRecoveryItems` log（~line 1740） | `× 1` → `× ${quantity}` |
| `tryUseRecoveryItems` 庫存驗證（~line 1717） | 見下方「庫存驗證調整」 |
| `useForgeRecoveryItem`（~line 800） | **不動**（SP=0 修復，一次即可） |

### 庫存驗證調整

驗證「補品是否有消耗」的條件需配合 quantity 調整：

```js
// Before（假設每次消耗 1 個）
if (afterQuantity >= before.quantity)

// After（消耗 quantity 個）
if (afterQuantity > before.quantity - quantity)
```

**送出前保護**：`calcUseQuantity` 已強制 `available >= maxPerUse` 才允許用10；
若 available < 10，quantity 必為 1，避免 API 錯誤。

### 邊界情況

| 情境 | 處理 |
|------|------|
| 庫存 < 10，但需 ≥ 10 | `available >= 10` 不成立 → quantity = 1 |
| 純 SP 補品（healHp = 0） | hpNeeded = 0，只看 spNeeded |
| 純 HP 補品（healSp = 0） | spNeeded = 0，只看 hpNeeded |
| both 補品，HP 已達標 SP 未達標 | hpGap = 0 → hpNeeded = 0，只看 spNeeded |
| needed = 0（已達標但仍進入函數） | quantity = 1（保守，讓外層重新判斷） |
| gap 計算結果 ≤ 0 | Math.max(0, ...) 保底為 0 → needed = 0 → quantity = 1 |

---

## 二、鍛造收取延遲修正

### 現狀

`forgeTurn` 流程：
1. `refreshForgeData()` → 取得最新 heroes（含 `canComplete`）
2. `nextForgeAction()` → 若有 `canComplete === true` → 送 `/completeForge`
3. 若全部仍在鍛造中（`canComplete` 未更新） → `wait` → `forgeSchedule(forgeWaitMs(...))`

`forgeWaitMs(actionCompleteTime)` 邏輯：
```js
dueAt > Date.now() → dueAt - Date.now() + 2000   // 未到時間，精準等待
dueAt ≤ Date.now() → 30000                         // 已逾時，fallback 30 秒
```

### 問題根因

**收取延遲最長達 30 秒**：鍛造到期但 server `canComplete` 尚未更新 →  
`forgeTurn` 在 `dueAt + 2000ms` 讀取 heroes → `canComplete` 仍 `false` →  
`forgeWaitMs` 返回 `30000` → 等 30 秒才重試。

**Log 效能問題**（開啟「鍛造除錯」時）：  
每次 `forgeTurn` 產生 4 個 debug event：
- `forge-data.refresh.started`
- `forge-data.refresh.completed`
- `forge.turn.action`
- `forge.wait`

每個 event 立即呼叫 `saveForgeDebugLogs()` → `localStorage.setItem` 序列化 200 筆 JSON。  
Wait 迴圈頻繁時，`renderForgeDebugLogs()` 若 dialog 開啟則重繪大量 DOM。

此外，`refreshForgeData` 每次都呼叫 `renderForgeSettings()`，重建整個鍛造面板 DOM，在 wait 迴圈中每輪均重繪。

**`enabledCompleteOnly` 阻擋收取（潛在 bug）**：  
`forgeBootScanned === true` 後，只對 `enabled === true` 的坊收取。  
若某坊在鍛造進行中被自動取消勾選（如下一輪開新坊時驗證失敗 → `enabled = false`），  
該坊的完成鍛造將永遠不被收取。

### 修改計畫

#### 2-1. `forgeWaitMs`：縮短逾時後的 fallback（app.js ~line 748）

```js
// Before
return Number.isFinite(dueAt) && dueAt > Date.now() ? dueAt - Date.now() + 2000 : 30000;

// After
if (!Number.isFinite(dueAt)) return 30000;
if (dueAt > Date.now()) return dueAt - Date.now() + 2000;
// 已逾時：近期逾時（2 分鐘內）縮短輪詢；逾時過久則維持 30 秒
return Date.now() - dueAt < 120000 ? 8000 : 30000;
```

效果：鍛造剛到期後，最多 8 秒完成收取（原本最多 30 秒）。

#### 2-2. `nextForgeAction`：移除 enabledCompleteOnly 對收取的限制（app.js ~line 386）

```js
// Before：boot 後只完成 enabled 坊
if (enabledCompleteOnly && !(drafts?.[Number(hero.actionTarget)]?.enabled === true)) continue;

// After：canComplete=true 的鍛造永遠收取，不受 enabled 影響
// （enabledCompleteOnly 只保留在 start 邏輯中，不在 complete 中使用）
```

#### 2-3. `recordForgeDebug`：抑制 wait 重複 event（app.js ~line 421）

連續相同的 `forge.wait`（相同帳號 + 相同 workshop）只記錄一次，避免大量重複 log：

```js
function recordForgeDebug(accountId, event, detail = {}) {
  if (!shouldRecordForgeDebug(config(accountId))) return;
  // 抑制連續重複的 forge.wait
  if (event === "forge.wait") {
    const last = forgeDebugLogs[0];
    if (last && last.accountRef === String(accountId) && last.event === "forge.wait" && last.workshop === detail.workshop) return;
  }
  forgeDebugLogs.unshift(...);
  ...
}
```

#### 2-4. `saveForgeDebugLogs`：debounce 寫入（app.js ~line 418）

避免每個 event 都立即序列化 200 筆 JSON：

```js
let _forgeDebugSaveTimer = null;
function saveForgeDebugLogs() {
  clearTimeout(_forgeDebugSaveTimer);
  _forgeDebugSaveTimer = setTimeout(() => {
    localStorage.setItem(forgeDebugLogKey, JSON.stringify(forgeDebugLogs.slice(0, forgeDebugLogLimit)));
  }, 800);
}
```

#### 2-5. `refreshForgeData`：wait 路徑跳過 renderForgeSettings（app.js ~line 432）

```js
// Before
async function refreshForgeData(accountId = activeId) {

// After
async function refreshForgeData(accountId = activeId, { skipRender = false } = {}) {
  ...
  if (accountId === activeId) { renderHeroes(accountId); if (!skipRender) renderForgeSettings(); }
}
```

在 `forgeTurn` 的 wait 路徑呼叫 `refreshForgeData(accountId, { skipRender: true })`；  
complete / start / error 路徑維持 `refreshForgeData(accountId)` 正常重繪。

### 預計影響

| 修改 | 收益 |
|------|------|
| forgeWaitMs 縮短 | 收取延遲從最多 30s → 最多 8s |
| enabledCompleteOnly 移除 | 自動取消勾選的坊仍能被收取 |
| forge.wait 重複抑制 | debug log 筆數大幅減少 |
| saveForgeDebugLogs debounce | localStorage 寫入頻率降低 |
| skipRender | wait 迴圈不再每 30s 重建鍛造面板 |

---

## 三、驗證碼過多自動休息（擬人模式）

### 需求

遊戲偵測到機器人行為時會頻繁彈出驗證碼。觸發次數過多代表帳號異常，應在擬人模式下自動暫停休息，以降低封號風險。**不勾選擬人模式時不啟用此行為。**

### 設計

**新增帳號狀態欄位**：
```js
captchaRecentCount: 0,   // 近 N 分鐘內的驗證碼次數（會衰減）
captchaRestUntil: 0,     // 休息到此時間戳（ms），0 = 不需休息
```

**觸發條件**（只在 `humanLike === true` 時判斷）：
- 每次遭遇驗證碼 → `captchaRecentCount++`
- `captchaRecentCount >= captchaRestThreshold`（預設 **5**）時 → 進入驗證碼休息
- 休息時長：**沿用擬人模式現有的亂數延遲函數**（如 `randomRestMs()` 或 `humanLikeDelay()`），不另設固定分鐘數，保持行為一致性

**衰減機制**：每次狩獵成功（無驗證碼）時，若距上次驗證碼已超過 `captchaDecayMins`（預設 **30 分鐘**），重置 `captchaRecentCount = 0`。

**休息邏輯（hunt loop）**：
```js
if (s.captchaRestUntil > Date.now()) {
  log(`驗證碼過多，休息中，預計 ${formatTime(s.captchaRestUntil)} 恢復`, accountId);
  return scheduleHunt(s.captchaRestUntil - Date.now() + 5000, accountId);
}
```

### 設定 UI（擬人模式區塊下方）

```html
<div class="captcha-rest-settings" id="captcha-rest-settings">
  <label>驗證碼休息門檻
    <input type="number" min="1" max="20" id="captcha-rest-threshold" value="5" />
    次後休息（時長沿用擬人模式亂數）
  </label>
</div>
```

顯示條件：擬人模式勾選時才顯示（CSS `hidden` 切換或 JS 控制）。

### 修改位置（app.js）

| 位置 | 修改內容 |
|------|---------|
| captcha 處理（`handleCaptcha` 或解題後） | `captchaRecentCount++`；判斷是否進入休息 |
| hunt loop 頂部 | 檢查 `captchaRestUntil > Date.now()` → 延後排程 |
| 成功狩獵回呼 | 衰減 captchaRecentCount |
| config 讀寫 | 新增 `captchaRestThreshold`、`captchaRestMinutes` 欄位 |
| renderAutomationSettings | 新增 UI，擬人模式 checkbox onchange 控制顯示 |

---

## 四、NoneCap 月用量重製按鈕

### 需求

NoneCap 月用量（`#nonecap-usage`）顯示「本月已用 N 次」。目前無法手動清零，加入「重製」按鈕讓使用者在月初或確認用量已重置後手動歸零。

### 設計

**儲存位置**：`localStorage` key = `nonecap_monthly_usage`，值為 `{ count: number, month: "YYYY-MM" }`。

月份自動重置邏輯（讀取時）：
```js
const key = "nonecap_monthly_usage";
function getNonecapUsage() {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    const thisMonth = new Date().toISOString().slice(0, 7);
    if (raw.month !== thisMonth) return { count: 0, month: thisMonth };
    return raw;
  } catch { return { count: 0, month: new Date().toISOString().slice(0, 7) }; }
}
```

**重製按鈕（index.html 修改位置）**：

目前：
```html
<span id="nonecap-usage" ...></span>
```

改為：
```html
<span id="nonecap-usage" ...></span>
<button id="reset-nonecap-usage" type="button" style="font-size:.8rem;padding:2px 8px;">重製</button>
```

**app.js 事件**：
```js
document.getElementById("reset-nonecap-usage").onclick = () => {
  localStorage.removeItem("nonecap_monthly_usage");
  renderNonecapUsage();
};
```

---

## 修改檔案彙整

| 檔案 | 改動 |
|------|------|
| `app.js` | calcUseQuantity、tryUseRecoveryItems quantity/log/驗證、forgeWaitMs、nextForgeAction enabledCompleteOnly、recordForgeDebug 抑制、saveForgeDebugLogs debounce、refreshForgeData skipRender、captchaRecentCount 休息邏輯、getNonecapUsage 月份重置、reset-nonecap-usage 事件 |
| `index.html` | 版號、captcha-rest-settings UI、reset-nonecap-usage 按鈕 |
| `styles.css` | `.captcha-rest-settings` 顯示控制 |
