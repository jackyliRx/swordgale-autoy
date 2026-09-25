# API 錄製索引

此資料夾保存手動操作的錄製檔與已確認 API 的索引。原始錄製檔可能含角色名稱、戰報或其他帳號資料，提交到公開 GitHub 前必須移除或去識別化。

## 更新規則

每次錄製或確認新的 API，都必須在本資料夾同步更新：操作名稱、方法與端點、前置條件、回應重點、已確認／待確認狀態，以及對應的去識別化範例。原始錄製檔只保存於本機且由 `.gitignore` 排除，不推送到 GitHub。

## 已錄製

| 操作 | 方法與端點 | 狀態 | 備註 |
| --- | --- | --- | --- |
| 取得角色卡 | `GET /api/heroes` | 已確認 | 一個帳號回傳多張角色卡；每張有 `id`。 |
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
| 區域玩家 | `GET /api/zoneUsers` | 已確認 | 在前行後觀測到的區域資料讀取。 |

## 尚未錄製

| 操作 | 需要確認的項目 |
| --- | --- |
| 攻擊 | 按鈕名稱、端點、冷卻與回應。 |
| 後退 | 端點、是否改變關卡、冷卻與回應。 |
| 死亡／重生 | `死亡` 的角色欄位與手動「重生／復活」端點。 |
| 死透了／轉生 | `死透了` 的角色欄位與手動「轉生／復活」端點。 |
| 權杖／登入與 CORS | GitHub Pages 是否能直接安全呼叫 API。 |

## 已定義的自動狩獵規則

設定目標樓層 `targetHuntStage` 後，低於目標時使用 `POST /api/hunt?type=forward`；到達目標時使用 `POST /api/hunt` 原地狩獵。每次行動前都先通過整隊 HP／體力恢復檢查，並等待伺服器回傳的 `huntAvailableAt`。超過目標或無法前行時停止，暫不自動後退。

## 錄製檔

| 檔案 | 內容 |
| --- | --- |
| `前行.js` | 包含原地狩獵、全部休息、全部完成休息與前行的原始錄製紀錄。 |
| `死亡狀態與完成行動.js` | 包含死亡／死透了的角色狀態與單一角色完成行動紀錄。 |

完整且去識別化的 API 規則見上層的 `../api-contract.md`。
