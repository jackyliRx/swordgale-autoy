# Autoy 待辦任務

## 功能一：自動換裝替換品挑選方式
- [x] 新增帳號全域設定 `equipPickPriority`（`dur_asc` / `atk_desc` / `def_desc` / `dur_desc`）
- [x] `defaultSettings()` 補預設值 `dur_asc`
- [x] `pickFromList()` 的 `candidates.sort` 改依設定排序（`atk + plus.atk` 合計）
- [x] `renderEquipSettings()` 換裝耐久門檻旁新增 `<select>` UI
- [x] 佇列為空的 hint 文字改為動態反映目前挑選方式

## 功能二：全域鍛造裝備名稱預設
- [x] 新增帳號全域設定 `forgeDefaultName`（字串）
- [x] `defaultSettings()` 補預設值 `""`
- [x] `validateForgeDraft()` 取名稱改為 `draft.name || config(accountId).forgeDefaultName`
- [x] `renderForgeSettings()` 鍛造坊清單上方新增「全域裝備名稱」輸入框
- [x] 各鍛造坊「裝備名稱」輸入框為空時顯示 fallback 提示（↳ 使用全域名稱：「xxx」）

## 功能三：全域裝備配方庫（跨帳號共用）
- [x] 配方庫獨立儲存於 `autoy.forgeRecipes.v1`（localStorage 頂層，不屬於任何帳號）
- [x] 每筆配方：`{ id, label, name, type, selectedMines[], recoveryItemId }`
- [x] 新增讀取/儲存配方庫的 helper（`loadForgeRecipes()` / `saveForgeRecipes()`）
- [x] 新增 `renderForgeRecipeDialog()` / dialog HTML
- [x] 配方庫 dialog：列出現有配方、新增配方表單（label、name、type、材料）、刪除
- [x] 各鍛造坊新增「套用配方」下拉，套用後覆蓋 name/type/selectedMines/recoveryItemId
- [x] 鍛造標題列右側新增「配方庫」按鈕（與「啟動鍛造」並排）

## 功能六：配方庫匯出 / 匯入
- [x] 配方庫 dialog 新增「複製 JSON」按鈕，將 `forgeRecipes` 匯出為 JSON 字串
- [x] 新增「貼上匯入」文字框 + 確認按鈕，解析 JSON 後合併或覆蓋現有配方
- [x] 匯入時做基本格式驗證（必要欄位檢查），錯誤時顯示提示

## 功能四：未讀取時啟動鍛造按鈕禁用（方案 A）
- [x] `renderForgeSettings()` 判斷 `state.forgeDataUpdatedAt == null`
- [x] 為 null 時「啟動鍛造」改為 `disabled`，標題列下方顯示「請先按「重新讀取」」提示

## 功能五：鍛造坊收合按鈕樣式統一
- [x] 各鍛造坊 header 的 `forge-toggle-btn`（▲）改為 `section-toggle` 樣式，文字顯示「收起／展開」
- [x] 「全部展開／收合」按鈕同樣改為 `section-toggle` 樣式

## 功能六：迷霧森林自動導航與地圖注意事項
- [x] 在「地圖入口與注意事項」顯示目前已驗證的入口、樓層與風險；大草原、草原秘徑與迷霧森林最高第 50 層，猛牛原最高第 45 層。
- [x] 草原秘徑第 25 層（超級綠水靈）與第 40 層（蘑菇王）每次狩獵或前進狩獵前，強制使用已設定補品將全隊 HP／SP 補滿；前後其他樓層恢復一般補給規則，無法補滿時停止。
- [x] 新增「迷霧森林」目標地圖選項，設定入口最低樓層為 27。
- [x] 支援連續路線：大草原第 16 層進入草原秘徑，再從草原秘徑第 27 層的 `zoneId: 10003` 進入迷霧森林。
- [x] 在迷霧森林持續依目標樓層執行原地或前進狩獵，不將前進請求視為必定增加樓層。
- [ ] 驗證迷霧森林 `POST /move/0` 後的 `POST /move/complete` 回應，確認返回初始之鎮的完整流程。

## 功能七：沼澤地自動導航與地圖注意事項
- [x] 新增「沼澤地」目標地圖選項，設定入口最低樓層為 27。
- [x] 支援連續路線：大草原第 11 層進入猛牛原，再從猛牛原第 27 層的 `zoneId: 10004` 進入沼澤地。
- [x] 在沼澤地持續依目標樓層執行原地或前進狩獵，以 API 回傳的實際樓層決定是否繼續前進。
- [ ] 驗證沼澤地 `POST /move/0` 後的 `POST /move/complete` 回應，確認返回初始之鎮的完整流程。
