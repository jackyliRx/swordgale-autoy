# Autoy API Contract

此文件只列出 Tampermonkey API Recorder 已實際錄到的端點。請求使用遊戲頁面的 `token` request header；token 僅保存於使用者瀏覽器，不可寫入紀錄、範例或版本庫。

## 英雄

| 端點 | 用途與證據 |
| --- | --- |
| `GET /api/heroes/{heroId}` | 取得單一英雄詳細資料，已錄到 HTTP 200；不能取代完整帳號英雄列表 `GET /api/heroes`。 |

## 休息與一般死亡復原

| 端點 | Body | 已確認回應與規則 |
| --- | --- | --- |
| `POST /api/heroes/restAll` | 無 | 樣本中英雄進入 `actionState: 2`，回傳 `actionCompleteTime`；等待時間依伺服器回傳值。 |
| `POST /api/heroes/restAll/complete` | 無 | 回傳 `huntInfo` 與恢復訊息；樣本中英雄回到 `actionState: 0`。完成後重讀完整英雄列表確認出戰名單和 HP/SP。 |
| 重生期間休息 | 無 | 當一般死亡角色為 `actionState: 3`，而其他已勾選出戰角色存活且閒置時，先讓存活角色 `restAll`。等待重生與休息的最晚完成時間，再依序完成重生與休息。 |
| `POST /api/heroes/reviveAll` | 無 | HTTP 200，回傳 3 張角色卡。一般死亡角色進入 `actionState: 3`、`canComplete: false`，並有約 10 分鐘後的 `actionCompleteTime`。這是帳號批次操作；依使用者決定，不限制未勾選角色，runner 對帳號內所有一般死亡角色等待與驗證。 |
| `POST /api/heroes/reviveAll/complete` | 無 | HTTP 200，完成整批重生；樣本中 3 張角色卡均為 `actionState: 0`，兩名出戰角色 `perished: false` 且 HP 已恢復。發送前須確認帳號內所有一般死亡角色均 `canComplete: true`；完成後重讀完整英雄列表驗證。 |
| `POST /api/heroes/{heroId}/completeAction` | 尚待補錄 body | 已在其他單一行動操作錄到。一般死亡批次重生使用 `/heroes/reviveAll/complete`，不是逐角呼叫此端點。 |

## 狩獵

| 端點 | Body | 已確認回應與規則 |
| --- | --- | --- |
| `POST /api/hunt` | 無 | 原地狩獵。回傳 `report`、`huntInfo`、`equipmentChanges`、`money`、`huntCount` 及伺服器 `huntAvailableAt`、`attackAvailableAt`。 |
| `POST /api/hunt?type=forward` | 無 | 狩獵並前行。一般樣本到大草原第 2 層；死亡樣本到第 5 層，戰報有英雄死亡，該英雄在 `huntInfo.heroes` 為 `hp: 0`、`perished: false`、`actionState: 0`。 |

## 戰報閱讀

| 端點 | Body | 已確認回應與規則 |
| --- | --- | --- |
| `GET /api/reports?type=hunt` | 無 | 回傳狩獵戰報列表；每筆有 `id`、地圖、樓層、時間與死亡數。僅在使用者手動要求閱讀時讀取。 |
| `POST /api/reports/{reportId}/view` | 無 | HTTP 200 回傳 `{ ok: true }`；標記使用者手動點選的單筆戰報為已閱。 |
| `GET /api/reports/{reportId}` | 無 | 回傳單筆戰報、雙方陣容與文字事件；用於本地摘要與閱讀，不納入自動狩獵排程。 |

## 移動

| 端點 | Body | 已確認回應與規則 |
| --- | --- | --- |
| `POST /api/move/0` | 無 | 「回城」從大草原啟動移動，HTTP 200；樣本中 2 名英雄進入 `actionState: 1`。 |
| `POST /api/move/1` | 無 | 「前往大草原」從初始之鎮啟動移動，HTTP 200；樣本中 2 名英雄進入 `actionState: 1`。 |
| `POST /api/move/complete` | 無 | 兩方向都已錄得 HTTP 200：回城完成到初始之鎮 `0/0`；前往大草原完成到大草原 `1/1`。 |

## 共通限制

- `huntInfo.heroes` 沒有 `selected`；出戰名單要以完整 `GET /api/heroes` 為準。
- 狩獵前確認出戰人數為 1 至 4 名。
- `reviveAll` 為帳號批次操作；使用者明確選擇不限未勾選角色。呼叫與完成前仍讀取完整英雄狀態，讓整批死亡角色都進入已知重生狀態並全部可完成，避免批次狀態不一致。
- 移動請求的 `{n}` 是移動操作參數，不是地圖 ID；最終目的地要在完成移動後以座標驗證。
- 寫入成功後依伺服器時間、冷卻、位置和英雄狀態排程，不猜測固定等待時間。
- 尚未錄製的轉生、攻擊、後退端點先手動錄製，再加入自動化。

對應錄製摘要見 [API 錄製索引](API錄製/README.md)。
