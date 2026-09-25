# Autoy

靜態 GitHub Pages 前端。使用者可在頁面新增帳號別名與遊戲 API token；token 僅保存在該瀏覽器的 `localStorage`，不會寫入 GitHub。已確認遊戲 API 使用 HTTP `token` header 傳送原始 JWT，不使用 `Authorization: Bearer`。

伺服器若在成功回應的 `token` header 提供更新值，Autoy 會自動更新該帳號的本機 token。

已實作：讀取多角色、全隊重複休息、目標樓層前行、到達後原地狩獵、停止與錯誤保護。

## 本機開啟

以任一靜態伺服器開啟此資料夾，例如：

```powershell
npx serve .
```

## GitHub Pages

將此資料夾作為 GitHub repository 根目錄。GitHub Actions workflow 會在推送至 `main` 時發布至 GitHub Pages；首次需在 repository 的 **Settings → Pages → Build and deployment** 選擇 **GitHub Actions**。

API 必須允許 GitHub Pages 網域的 CORS，且 API token 必須能以 `token: <token>` header 使用。若伺服器未允許跨來源請求，瀏覽器會阻擋呼叫。
