# Tampermonkey API Recorder

檔案：`autoy-api-recorder.user.js`

## 安裝

1. 在 Chrome／Edge 安裝 Tampermonkey。
2. 開啟 Tampermonkey Dashboard，按「新增腳本」。
3. 以 `autoy-api-recorder.user.js` 的完整內容取代預設內容後儲存。
4. 開啟或重新載入 `https://myteam.swordgale.online/`。

右下角會出現 **Autoy API Recorder**。勾選「啟用紀錄」後再操作遊戲，面板會記錄 fetch／XHR 的 request 與 response。每組事件以相同 `requestId` 配對，包含 method、URL、request body、request headers、HTTP status、response body 和耗時。

可直接複製 JSON 或下載 JSON。最多保留 100 筆事件，並使用瀏覽器 `localStorage` 暫存。token、Authorization、Cookie、密碼、secret、API key 會自動遮罩。
