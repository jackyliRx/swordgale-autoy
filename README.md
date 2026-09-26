# Autoy

靜態 GitHub Pages 前端。使用者可在頁面新增帳號別名與遊戲 API token；token 僅保存在該瀏覽器的 `localStorage`，不會寫入 GitHub。已確認遊戲 API 使用 HTTP `token` header 傳送原始 JWT，不使用 `Authorization: Bearer`。

伺服器若在成功回應的 `token` header 提供更新值，Autoy 會自動更新該帳號的本機 token。

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
