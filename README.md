# Autoy

靜態 GitHub Pages 前端。使用者可在頁面新增帳號別名與遊戲 API token；token 僅保存在該瀏覽器的 `localStorage`，不會寫入 GitHub。已確認遊戲 API 使用 HTTP `token` header 傳送原始 JWT，不使用 `Authorization: Bearer`。

伺服器若在成功回應的 `token` header 提供更新值，Autoy 會自動更新該帳號的本機 token。

## Tampermonkey 半自動登入切換器

`tools/autoy-account-switcher.user.js` 是獨立的 Tampermonkey 外掛，適用於 `https://myteam.swordgale.online/*`。
目前版本為 `1.1.1`。

1. 在 Tampermonkey Dashboard 建立腳本，貼上該檔案完整內容並儲存。
2. 在登入頁新增帳號別名與使用者名稱／Email；資料只保存在 Tampermonkey 的腳本儲存空間。可儲存多筆：輸入未使用過的新別名後按「新增／更新帳號」會新增一筆；使用相同別名儲存則更新該筆使用者名稱。每次儲存後會自動重設為「選擇帳號」，避免下一筆意外覆寫目前帳號。
3. 選擇帳號後按「填入帳號」，再由瀏覽器密碼管理器填入密碼並按「登入」。
4. CAPTCHA、OTP 與裝置核准必須由使用者完成；外掛不嘗試繞過或記錄這些驗證資料。

外掛不保存密碼、Cookie、驗證碼或 token。它的「登出並清除本站 Local Storage」按鈕會先請求確認，接著清除 `myteam.swordgale.online` 的 Local Storage 並回到 `/login`；Tampermonkey 保存的帳號別名不會刪除，且 HTTP-only Cookie 不能由 userscript 清除。

## 補品異常紀錄

補品消耗偵錯直接整合於 Autoy 的補品流程。正常使用不會寫入紀錄；只有 API 請求結果仍無法確認、回應缺少背包／角色、重新讀取後庫存未減少，或庫存已消耗但 HP／SP 未增加時，才建立一個異常案件。若補品請求被中止，但重新讀取背包已確認庫存下降，Autoy 視為已成功消耗、絕不重送請求並繼續狩獵。若中止是 watchdog 或流程錯誤觸發，會在確認消耗後恢復狩獵；手動停止、停止全部與移除帳號則只確認結果、不會自行恢復。案件會保存補品／角色前後摘要、`quantity`／`available`、庫存差值、中止錯誤、停止原因、API 佇列狀態及每次驗證的排程與實際耗時。最終會分類為已消耗、已確認未扣除、已確認庫存增加或資料不足，不會覆寫先前資料。

在目前帳號的工具列按「補品異常」，勾選「啟用補品異常攔截與紀錄」後才會建立案件並啟用安全攔截、背包驗證與詳細時間線。未勾選時，補品結果未確認會直接交給下一輪重新讀取與處理，不攔截、不驗證、不記錄，可能重複消耗。可在此查看、複製 JSON 或清除該帳號案件。最多保留 100 件案件、每件最多 30 個時間線項目。資料與帳號 token 分開保存於 `autoy.itemRecoveryIncidents.v1`；紀錄不含 token、帳密、headers、完整 request／response 或帳號名稱。

## 鍛造除錯與前置驗證

在目前帳號工具列按「鍛造除錯」，勾選「啟用鍛造除錯紀錄」後才保存新的鍛造資料讀取、設定驗證與流程錯誤摘要；預設關閉。資料依帳號隔離，最多保留 200 筆，可複製去敏 JSON 或只清除目前帳號紀錄。紀錄不包含 token、Cookie、角色名稱、裝備名稱、完整 request／response 或原始 API recorder JSON。

鍛造前置驗證已加入官方公開鍛造介面的類型／上限讀取器，以及以帳號 profile 的 `forgeExpanded + 1` 計算工作坊數量的規則。角色必須存活、閒置且位於初始之鎮；材料數量必須為正整數、不得超過可用庫存與目前裝備類型上限。這一版尚未將資料讀取器接入鍛造面板，也不會自動送出開始或完成鍛造請求。

可在同一瀏覽器保存多個帳號 token；每個帳號各自保存設定、排程、冷卻與角色狀態。帳號列可分別啟動／停止，多個 token 可同時自動狩獵；切換畫面只切換檢視，不影響其他帳號。每個帳號僅使用 `selected: true` 的出戰角色，超過 4 名或狀態不明時不會呼叫狩獵 API。

已實作：多帳號 token 各自獨立並行狩獵、各自設定、依出戰勾選篩選角色（最多 4 名）、讀取多角色、全隊重複休息、目標樓層前行、到達後原地狩獵、停止與錯誤保護。

「無動作提醒分鐘」預設為 3 分鐘。若超過下一次預期動作時間仍未完成任何流程，Autoy 會取消請求、停止自動化並顯示提醒。

角色 `hp: 0, perished: false` 會標示為「死亡」；`perished: true` 會標示為「死透了」。自動狩獵偵測出戰角色進入任一死亡狀態時，會暫停狩獵並依已確認的移動與復原 API 流程接續處理：一般死亡對帳號內死亡角色批次重生，出戰死透角色逐角轉生；復原後重新檢查隊伍、HP／SP 與冷卻，條件符合才恢復狩獵。回城與前往大草原的移動是分別錄製並串接；上線後仍應在遊戲確認整段循環及錯誤情況。

## 本機開啟

以任一靜態伺服器開啟此資料夾，例如：

```powershell
npx serve .
```

## GitHub Pages

將此資料夾作為 GitHub repository 根目錄。GitHub Actions workflow 會在推送至 `main` 時發布至 GitHub Pages；首次需在 repository 的 **Settings → Pages → Build and deployment** 選擇 **GitHub Actions**。

API 必須允許 GitHub Pages 網域的 CORS，且 API token 必須能以 `token: <token>` header 使用。若伺服器未允許跨來源請求，瀏覽器會阻擋呼叫。
