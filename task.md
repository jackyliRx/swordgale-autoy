# Autoy：GitHub Pages 遊戲輔助工具任務書

## 目標

建立 `autoy` 為純前端的遊戲輔助網站，部署到 GitHub Pages。第一版提供安全可停止的自動戰鬥；後續可加入採礦、回收、鍛造等模組。

本專案不使用瀏覽器擴充功能、外掛程式或後端代理。使用者在網站中自行提供授權權杖，權杖只保存在該使用者瀏覽器的本機儲存空間，並由瀏覽器直接呼叫遊戲公開且已授權使用的 API。

## 多帳號、多角色資料模型

新版的基本單位是「帳號」之下有多張「角色卡」，不可再以一個 token 等同一個角色設計。

```text
Account（遊戲帳號／授權憑證）
├── Hero card A（heroId、顯示名稱、目前狀態、戰鬥設定、執行器）
├── Hero card B（heroId、顯示名稱、目前狀態、戰鬥設定、執行器）
└── Hero card C（heroId、顯示名稱、目前狀態、戰鬥設定、執行器）
```

| 資料 | 身分與用途 | 保存範圍 |
| --- | --- | --- |
| `Account` | `accountId`、帳號別名、權杖參照、最後同步時間 | 每個遊戲帳號一筆 |
| `Hero` | `heroId`、名稱、頭像、等級、可用狀態 | 每張角色卡一筆，隸屬 Account |
| `HeroSettings` | 目標地圖、HP/MP 閾值、補給與 Boss 策略 | 每個 `accountId + heroId` 一份 |
| `HeroRun` | 狀態機、AbortController、run id、事件紀錄 | 每個正在運行的角色一份，重新整理後不自動續跑 |

介面先顯示帳號清單，展開後顯示其角色卡。角色卡可以各自啟動或停止；「停止帳號」停止該帳號全部角色，「停止全部」停止所有帳號。

排程規則：預設每個帳號只允許一張角色卡發出遊戲行動請求，避免新版 API 實際上共用帳號冷卻、行動佇列或資源而互相衝突。若 API 探勘證明角色已完全隔離，才可在設定中開放同帳號的平行執行。不同帳號可各自排程，但仍受全站並發與頻率限制。

多角色狩獵採用「隊伍屏障」：使用者可為同帳號角色建立一個狩獵隊伍；下一次狩獵前，隊內每位角色都必須完成休息或既有行動並由 API 確認為空閒。整隊休息使用 `restAll` 啟動、`restAll/complete` 完成。任一角色仍忙碌、死亡、缺失或狀態不明時，整隊轉為等待，禁止發出開始狩獵請求。這避免只讓其中一名角色行動。

API 尚未確認前，不假設角色切換方式。`GameApi` 應預留以下可替換的流程：

1. `listHeroes(account)`：取得帳號角色卡清單。
2. `selectHero(account, heroId)`：若後端要求切換角色，回傳該角色的請求上下文。
3. `getHeroState(context)` 與 `runBattleTurn(context, settings)`：後續全部請求都帶入明確的角色上下文。

這可兼容「header 或 body 帶 `heroId`」、「切換角色後取得新 token」及「每張角色卡使用獨立 token」三種 API 實作。

## 已知參考

### `D:\tools\AutoTools\auto_GAO`

參考專案為 Vue 3 + TypeScript + Pinia + Axios 的前端工具，包含：

- 多帳號與個別設定的本機保存。
- 角色、背包、裝備查詢。
- 自動戰鬥的輪詢、補血補魔、移動、秘徑、裝備確認與 Boss 策略。
- 自動採礦、回收、鍛造與市場操作的既有介面及 API 封裝。

可沿用它的「功能模組 + API 介面層 + 可取消輪詢」架構，但不可直接複製權杖、帳號資料或請求紀錄。

### 英雄頁

指定頁面：`https://myteam.swordgale.online/heroes/488`

目前頁面無法以本工作環境的網頁擷取器或瀏覽器服務開啟，尚未取得可驗證的 HTML 或 API 資訊。實作前應由有權限的開發者在已登入的瀏覽器中完成下列觀測，並移除 Cookie、Authorization、帳號與角色資料後，才提交到版本庫：

1. 記錄頁面載入時的請求 URL、方法、必要標頭名稱、請求本文欄位與回應 JSON 結構。
2. 對「開始戰鬥、完成行動、補給、移動」各做一次人工操作，記錄其請求順序及等待條件。
3. 比對 API 是否同源、是否允許 GitHub Pages 網域的 CORS 請求，以及是否有服務條款或頻率限制。
4. 只把已確認可用、公開或獲授權的端點寫入 `docs/api-contract.md`；不得以爬蟲繞過登入、存取限制、CAPTCHA 或反自動化保護。

## 技術方案

| 項目 | 決定 |
| --- | --- |
| 前端 | Vue 3、TypeScript、Vite、Pinia、Axios |
| 網站代管 | GitHub Pages，GitHub Actions 建置並發布 `dist/` |
| 資料保存 | `localStorage`，使用者可清除、匯出或匯入設定 |
| API 存取 | 瀏覽器直接 HTTPS 呼叫；不建立轉送 API 或保存帳密的後端 |
| 發布路徑 | 使用 Vite `base: '/<repository-name>/'`，自訂網域時改為 `'/'` |

GitHub Pages 是靜態網站，無法代替遊戲 API 處理登入、隱藏祕密或繞過 CORS。若遊戲 API 不允許 GitHub Pages 的跨來源請求，本計畫只能停在資料展示與設定 UI；需取得 API 擁有者的 CORS 許可後才可啟用自動化。

## 範圍與功能

### P0：API 探勘（優先開始）

- [ ] 使用 `tools/api-recorder.js` 在瀏覽器 DevTools Console 啟動本機錄製；使用者每次點選角色卡或手動操作後，記錄 `fetch`／XHR 的已遮罩請求與回應摘要。
- [x] 已確認 `GET /api/heroes` 會列出目前帳號的所有角色卡，且每張卡有數字 `id`、狀態與行動完成時間；詳見 `docs/api-contract.md`。
- [x] 已確認角色卡切換為 `GET /api/heroes/{heroId}` 與 `GET /api/heroes/{heroId}/statuses`；未觀測到切換角色的寫入 API。
- [x] 已確認 `POST /api/heroes/{heroId}/completeAction`；只能在最新狀態為 `canComplete: true` 時單次呼叫，逾時後以重新讀取狀態判斷結果，不得重送。
- [x] 已確認整隊休息：`POST /api/heroes/restAll` 啟動，等候回傳的 `actionCompleteTime` 後以 `POST /api/heroes/restAll/complete` 單次完成；不需逐一完成角色。
- [x] 已確認「原地狩獵」為 `POST /api/hunt`，無觀測到 request body，會一次處理帳號的出戰角色；後續排程以回應的 `huntAvailableAt` 與 `attackAvailableAt` 為準。
- [x] 已確認「前行」為 `POST /api/hunt?type=forward`，無觀測到 request body；只有最新狀態 `canForward: true`、全隊就緒且冷卻結束時可執行，回應的實際 `huntStage` 為準。
- [ ] 以未登入讀取請求確認公開頁、登入入口與 API base URL 是否可達；目前工作環境的網路代理回應 `127.0.0.1:9` 連線失敗，無法直接進行此步。
- [ ] 在已授權帳號中擷取「進入角色卡頁、列出角色、選取角色、讀取狀態」的網路請求，建立去識別化 HAR 或 JSON 摘要。
- [ ] 判斷角色識別是在 URL、header、query、request body、cookie session 或切換 API 中傳遞。
- [ ] 驗證同一帳號兩張角色卡同時發送讀取及行動請求時，伺服器是否共享冷卻、行動狀態或資源。
- [ ] 先完成角色清單、選擇角色、讀取角色狀態的 contract test；未通過前不開發自動戰鬥。

驗收：`docs/api-contract.md` 記錄多角色流程，且以去識別化 fixture 測試 `listHeroes`、`selectHero` 與 `getHeroState`。

### P1：可部署的骨架

- [x] 建立不需建置工具的靜態 Web App 於 `autoy/`，提供多帳號 token、角色卡與自動狩獵 UI。
- [x] 建立 GitHub Pages workflow，推送 `main` 時發布靜態 artifact。
- [x] 首頁顯示 API 連線狀態、目前帳號別名與停止按鈕。
- [ ] 加入 `README.md`：本機啟動、GitHub Pages 設定、支援範圍與資料保存說明。

驗收：推送 `main` 後，GitHub Pages 可開啟網站，重新整理任一路由不會白頁。

### P2：API 契約與前端實作

- [x] 已確認 API 使用 HTTP `token` header 傳遞原始 JWT；Autoy 只在瀏覽器本機保存 token，不使用 Bearer Authorization header。
- [ ] 建立 `src/api/gameApi.ts`，只公開已驗證的讀取與行動函式。
- [ ] 以人工瀏覽器網路觀測驗證 API 流程；可用爬蟲僅針對公開、無登入限制的頁面或已獲授權帳號。
- [ ] 建立 `docs/api-contract.md`，寫明每個端點的用途、方法、輸入、輸出、前置狀態、冷卻時間與錯誤碼。
- [ ] 對每個 API 回應做 runtime schema 驗證；欄位不符時停止自動化並保留診斷資訊。

驗收：可從網站按下「測試連線」取得經遮罩的角色摘要，無效權杖會明確提示且不寫入日誌。

### P3：帳號、角色與設定管理

- [ ] 使用者輸入 API base URL、帳號別名與權杖；權杖輸入框預設遮罩。
- [ ] 權杖僅保存於 `localStorage`，提供單筆刪除、全部清除及遮罩顯示。
- [ ] 新增帳號後先同步角色卡；角色卡資料以 `accountId + heroId` 去重並快取。
- [ ] 每張角色卡擁有獨立的戰鬥設定與執行狀態；帳號層只保存共用授權資訊。
- [ ] 匯出設定時預設排除權杖；含權杖匯出需另行明確勾選。

驗收：帳號與角色卡切換不會共用設定；重新載入後設定仍存在；清除帳號會立即停止該帳號所有角色的工作。

### P4：自動戰鬥

- [ ] 建立狀態機：`idle → checking → recovering/moving/fighting → waiting → stopped/error`。
- [ ] 每回合先讀取角色狀態，再依設定處理 HP、MP、位置、裝備與戰鬥。
- [ ] 支援選擇目標區域、最小 HP/MP 閾值、恢復方式、輪詢間隔與每輪最大行動數。
- [ ] 只有 API 契約已確認的行動才可啟用；不明端點保持停用。
- [ ] 每張角色卡有 AbortController 與 run id；按下停止、切換角色、卸載頁面或 API 錯誤時立即取消後續請求。
- [ ] 帳號層有行動佇列鎖，預設序列化同帳號的角色行動；只有 API 契約明確支援時才允許平行。
- [ ] 新增 `HuntParty` 隊伍設定與屏障：以 `restAll`／`restAll/complete` 完成整隊休息，確認全部空閒後才可開始下一次狩獵。
- [ ] 每個 `HuntParty` 可設定 HP 目標百分比、體力（SP）目標百分比與 `restIntervalMinutes`；整隊完成休息後，任一隊員未達標即重複休息，直到全員達標。
- [ ] 休息完成排程採 `max(actionCompleteTime, rest started time + restIntervalMinutes)`，設定可在等待時調整，且不會早於伺服器允許的完成時間。
- [ ] 自動狩獵可設定 `targetHuntStage`：低於目標時呼叫前行，到達目標後改為原地狩獵；高於目標或 `canForward: false` 時停止並顯示原因。
- [x] 新增無動作防呆：可設定提醒分鐘；超過下一次預期動作時間仍無進度時，取消請求、停止自動化、顯示醒目提醒並寫入事件紀錄。
- [ ] 以指數退避處理暫時性失敗；401/403、schema 不符、重複 409、頻率限制或未知狀態時停止並要求人工處理。
- [ ] 顯示可讀的最近 100 筆事件紀錄，紀錄中不得出現權杖、Cookie 或完整回應內容。

驗收：

1. 未設定有效 API 契約時，開始按鈕不可用。
2. 正常狀態下只依已確認流程執行一次回合。
3. 任一停止動作後不會再發出新的遊戲行動請求。
4. API 回傳錯誤時狀態轉為 `error`，不會無限重試或重複扣除資源。

### P5：後續模組

- [ ] 自動採礦：查詢、啟動、等待、領取，並遵循伺服器冷卻時間。
- [ ] 自動回收：先提供預覽清單與規則，再要求使用者啟用執行。
- [ ] 自動鍛造：顯示材料驗證、配方與預估次數。
- [ ] 市場與抽獎等涉及遊戲資產的行為保持人工確認，不納入預設自動執行。

## 建議目錄

```text
autoy/
├── .github/workflows/deploy-pages.yml
├── docs/api-contract.md
├── src/
│   ├── api/client.ts
│   ├── api/gameApi.ts
│   ├── automation/battleRunner.ts
│   ├── automation/types.ts
│   ├── stores/account.ts
│   ├── stores/automation.ts
│   ├── views/BattleView.vue
│   └── components/
├── vite.config.ts
├── package.json
└── README.md
```

## 實作順序

1. 先完成 P0 多角色 API 探勘與去識別化 fixture，確認角色切換與帳號併發規則。
2. 建立 P1 專案、GitHub Pages workflow 與帳號／角色卡空白 UI。
3. 實作 P2 API client 和 P3 多帳號、多角色設定及資料遮罩。
4. 以 mock API 先測試 P4 狀態機的停止、帳號佇列鎖、重試與錯誤流程。
5. 在已授權的實際帳號上以單角色、單回合模式驗證，確認後才開放循環模式與多角色排程。
6. 依需求逐一加入 P5 模組。

## 完成定義

- GitHub Pages 免費網站可由公開網址開啟。
- 前端不含任何權杖、Cookie、帳密或提交過的 API 回應範例。
- 自動戰鬥只使用已驗證且獲授權的 API 流程，且隨時可停止。
- API 無法跨來源存取或契約改變時，工具會停止行動並清楚顯示原因。
- README 與 `docs/api-contract.md` 足以讓下一位開發者部署與維護。
