# API 錄製索引

此資料夾保存手動操作的錄製檔與已確認 API 的索引。原始錄製檔可能含角色名稱、戰報或其他帳號資料，提交到公開 GitHub 前必須移除或去識別化。

## 更新規則

每次錄製或確認新的 API，都必須在本資料夾同步更新：操作名稱、方法與端點、前置條件、回應重點、已確認／待確認狀態，以及對應的去識別化範例。原始錄製檔只保存於本機且由 `.gitignore` 排除，不推送到 GitHub。

## 已錄製

| 操作 | 方法與端點 | 狀態 | 備註 |
| --- | --- | --- | --- |
| 取得角色卡／出戰勾選 | `GET /api/heroes` | 已確認 | 一個帳號回傳多張角色卡；以 `selected` 判斷出戰；每帳號最多 4 名。 |
| 開啟角色卡 | `GET /api/heroes/{heroId}` | 已確認 | 取得單一角色詳細資料。 |
| 角色狀態效果 | `GET /api/heroes/{heroId}/statuses` | 已確認 | 角色專屬狀態清單。 |
| 取得裝備 | `GET /api/equipments` | 已確認 | 以 `equipped === heroId` 關聯裝備。 |
| 完成單一行動 | `POST /api/heroes/{heroId}/completeAction` | 已確認 | 僅在 `canComplete: true` 時單次執行。 |
| 全部休息 | `POST /api/heroes/restAll` | 已確認 | 無 request body；回應全隊 `actionCompleteTime`。 |
| 全部完成休息 | `POST /api/heroes/restAll/complete` | 已確認 | 無 request body；一次完成全隊休息。 |
| 原地狩獵 | `POST /api/hunt` | 已確認 | 無 request body；處理帳號出戰角色。 |
| 前行 | `POST /api/hunt?type=forward` | 已確認 | 無 request body；需 `canForward: true` 與冷卻結束。 |
| 任務 | `GET /api/quests` | 已確認 | 讀取任務與刷新冷卻。 |
| 成就 | `GET /api/achievements` | 已確認 | 讀取成就與帳號統計。 |
| 防守通知 | `GET /api/reports/defend/status` | 已確認 | 被動通知查詢。 |
| 帳號資料 | `GET /api/profile` | 已確認 | 帳號摘要、金錢與英雄欄位上限。 |
| 區域清單 | `GET /api/zones` | 已確認 | 可進入的區域名稱與說明。 |
| 狩獵狀態 | `GET /api/huntInfo` | 已確認 | 權威的隊伍、樓層、冷卻與 `canForward`／`canBack` 狀態。 |
| CAPTCHA 狀態 | `GET /api/captcha` | 已確認 | 只讀取待驗證狀態；不處理 CAPTCHA。 |
| 區域玩家 | `GET /api/zoneUsers` | 已確認 | 在前行後觀測到的區域資料讀取。 |
| 全部重生 | `POST /api/heroes/reviveAll` | 已確認 | 無 request body；正常死亡角色開始重生，回傳 `actionCompleteTime`；死透角色不變。 |
| 個別轉生 | `POST /api/heroes/{heroId}/reincarnate` | 端點已確認 | 依 Console 請求紀錄確認；提供的原始檔未包含該筆，因此 body 與 response 未確認。 |
| 回程／返回起點 | `POST /api/move/0` | 已確認 | 無 request body；開始後的狩獵位置資料曾回報大草原 1/1，完成後目的地以 `/huntInfo` 為準。 |
| 前往大草原 | `POST /api/move/1` | 已確認 | POST 200；4 名英雄開始移動，仍在初始之鎮 `0/0`，以 `actionCompleteTime` 等待後完成移動。 |
| 完成移動 | `POST /api/move/complete` | 已確認 | 大草原錄製回到 1/1、2 名英雄空閒；隨後 `GET /api/zoneUsers` 回 200。不同情境位置仍須以 `/huntInfo` 確認。 |

## 尚未錄製

| 操作 | 需要確認的項目 |
| --- | --- |
| 攻擊 | 按鈕名稱、端點、冷卻與回應。 |
| 後退 | 端點、是否改變關卡、冷卻與回應。 |
| 死透了／轉生 | `perished: true` 狀態已確認；手動「轉生／復活」端點待錄製。 |
| 權杖／登入與 CORS | GitHub Pages 是否能直接安全呼叫 API。 |

## 已定義的自動狩獵規則

設定目標樓層 `targetHuntStage` 後，低於目標時使用 `POST /api/hunt?type=forward`；到達目標時使用 `POST /api/hunt` 原地狩獵。每次行動前都先通過整隊 HP／體力恢復檢查，並等待伺服器回傳的 `huntAvailableAt`。超過目標或無法前行時停止，暫不自動後退。

## 錄製檔

| 檔案 | 內容 |
| --- | --- |
| `前行.js` | 包含原地狩獵、全部休息、全部完成休息與前行的原始錄製紀錄。 |
| `死亡狀態與完成行動.js` | 包含死亡／死透了的角色狀態與單一角色完成行動紀錄。 |
| `死亡狀態判定.md` | 去識別化的死亡狀態欄位與停止自動狩獵規則。 |
| `全部重生.js` | 原始本機錄製：`POST /api/heroes/reviveAll`；含敏感帳號資料，不應提交。 |
| `全部重生.md` | 去識別化摘要，記錄重生狀態、預定完成時間與待確認事項。 |
| `各別轉生.js` | 原始本機 recorder 匯出；含帳號資料，不應提交。Console 已觀察到個別轉生 POST。 |
| `各別轉生.md` | 去識別化端點摘要，標記 request body 與 response 尚待完整擷取。 |
| `回程.js` | 原始本機錄製，含角色資料，不應提交。 |
| `回程.md` | 去識別化摘要，描述回程端點與已觀察的回傳位置。 |
| `前往-大草原.md` | 去識別化摘要；記錄 `POST /move/1` 成功後仍位於城鎮、出戰角色移動中與完成時間。 |
| `完成移動.js` | 原始本機錄製，含其他玩家資料，不應提交。 |
| `完成移動-大草原.js` | 原始本機錄製，含其他玩家資料，不應提交；已包含完成移動與其後的區域玩家讀取。 |
| `完成移動.md` | 去識別化摘要：移動完成會依情境抵達初始之鎮或大草原第 1 層；記錄最新兩筆請求摘要。 |

完整且去識別化的 API 規則見上層的 `../api-contract.md`。
