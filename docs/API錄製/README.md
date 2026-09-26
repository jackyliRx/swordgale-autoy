# API 錄製索引

此資料夾收錄 Tampermonkey Recorder 實際匯出的操作，以及依錄製整理的去識別化摘要。原始 `.json` 僅在本機保存，不提交 GitHub。

## 已確認錄製

| 操作 | 實際請求 | 摘要 | 原始紀錄 |
| --- | --- | --- | --- |
| 單一英雄詳細資料 | `GET /api/heroes/{heroId}` | [帳號英雄列表－角色詳細資料](帳號英雄列表-角色詳細資料.md) | `帳號英雄列表-角色詳細資料.json` |
| 全部休息 | `POST /api/heroes/restAll` | [全部休息－出戰角色](全部休息-出戰角色.md) | `全部休息-出戰角色.json` |
| 完成休息 | `POST /api/heroes/restAll/complete` | [完成休息－出戰角色](完成休息-出戰角色.md) | `完成休息-出戰角色.json` |
| 死亡重生期間的存活隊員休息 | `POST /api/heroes/restAll`、`POST /api/heroes/restAll/complete` | [死亡重生－存活隊員全部休息](死亡重生-存活隊員全部休息.md) | `死亡重生-存活隊員全部休息.json` |
| 原地狩獵 | `POST /api/hunt` | [原地狩獵](原地狩獵.md) | `原地狩獵.json` |
| 狩獵前行 | `POST /api/hunt?type=forward` | [狩獵－前行](狩獵-前行.md) | `狩獵-前行.json` |
| 狩獵造成死亡 | `POST /api/hunt?type=forward` | [狩獵－死亡](狩獵-死亡.md) | `狩獵-死亡.json` |
| 狩獵戰報列表與詳情 | `GET /api/reports?type=hunt`、`POST /api/reports/{id}/view`、`GET /api/reports/{id}` | [戰報－列表與詳情](戰報-列表與詳情.md) | `autoy-api-recorder-2026-09-26T11-50-29-184Z.json` |
| 全部重生 | `POST /api/heroes/reviveAll` | [全部重生](全部重生.md) | `全部重生.json` |
| 全部重生－完成行動 | POST /api/heroes/reviveAll/complete | [全部重生－完成行動](全部重生-完成行動.md) | 全部重生-完成行動.json |
| 回城（啟動移動） | `POST /api/move/0` | [回城](回城.md) | `回城.json` |
| 回城－完成行動 | `POST /api/move/complete` | [回城－完成行動](回城-完成行動.md) | `回城-完成行動.json` |
| 前往大草原（啟動移動） | `POST /api/move/1` | [前往大草原](前往大草原.md) | `前往大草原.json` |
| 前往大草原－完成行動 | `POST /api/move/complete` | [前往大草原－完成行動](前往大草原-完成行動.md) | `前往大草原-完成行動.json` |

## 錄製方式

1. Tampermonkey 面板勾選「啟用紀錄」。
2. 清除舊紀錄，只操作一個功能，等請求完成。
3. 匯出 JSON 至此資料夾，再提供檔案路徑與操作名稱，以便整理摘要和索引。
4. 原始 JSON 不可提交 GitHub；摘要不可含 token、帳號、角色名稱、戰報全文或其他個資。

`huntInfo.heroes` 是縮減資料，沒有 `selected`。出戰名單以完整的 `GET /api/heroes` 為準。

