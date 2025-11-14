# Snapshot 功能說明

> 程式碼快照生成與分析

## 概述

快照功能快速掃描專案，生成壓縮的結構化資料，用於 AI 輔助重構和品質分析。

---

## 基本用法

```bash
# 生成快照
agent-ide snapshot --path /path/to/project --output snapshot.json

# 搭配品質分析
agent-ide shit --path /path/to/project --format json
```

---

## 實戰案例

### TypeScript 型別安全重構

**專案**：62 檔案、4740 行、46 個 `any` 使用

**流程**：

#### 1. 快照與問題識別（8.7 秒）

```bash
agent-ide snapshot --path . --output before.json
agent-ide shit --path . --format json > before-shit.json
```

**快照統計**：
- 檔案：59
- 符號：1570
- Token：59,138
- 耗時：8.7 秒

**ShitScore**：22.02（Type Safety: 100.00）

#### 2. 規劃重構

- Phase 1：Controller DTO 化（消除 11 個 `any` 參數）
- Phase 2：統一資料型別（使用 interface）
- Phase 3：擴展型別定義（型別繼承）

#### 3. 執行重構

- 新增：2 檔案（DTO）
- 修改：20 檔案
- 關鍵改善：
  - `@Param() params: any` → `@Param() params: QueryParamsDto`
  - `catch (error: any)` → `catch (error: unknown)` + 型別窄化

#### 4. 驗證成果

```bash
npx tsc --noEmit  # ✅ 0 錯誤
npm run build     # ✅ 成功

agent-ide snapshot --path . --output after.json
agent-ide shit --path . --format json > after-shit.json
```

---

## 成果數據

| 指標 | 重構前 | 重構後 | 改善 |
|------|--------|--------|------|
| ShitScore | 22.02 | 19.56 | -11% ✅ |
| Type Safety | 100.00 | 64.52 | -35% ✅ |
| Quality Assurance | 60.00 | 44.34 | -26% ✅ |
| TypeScript 錯誤 | 46 個 `any` | 0 | -100% ✅ |

---

## 關鍵心得

### ✅ 優勢

1. **快速定位**：8.7 秒掃描 62 檔案，精準識別 46 個 `any` 位置
2. **量化追蹤**：ShitScore 提供統一評估標準，四維度分析
3. **Token 效率**：快照僅 59k tokens，壓縮率高
4. **規劃輔助**：清晰的專案結構和依賴關係

### ⚠️ 限制

1. **需搭配實際程式碼**：無法替代讀取檔案
2. **不能直接修改**：快照是唯讀分析工具
3. **評分考量**：臨時型別轉換（`as any`）仍計入分數

---

## 最佳實踐

### 推薦工作流程

```bash
# 1. 初始分析
agent-ide snapshot --path . --output before.json
agent-ide shit --path . --detailed --format json > before-shit.json

# 2. 執行重構（持續驗證）
npx tsc --noEmit

# 3. 成果驗證
agent-ide snapshot --path . --output after.json
agent-ide shit --path . --detailed --format json > after-shit.json

# 4. 比較改善
# 自訂腳本分析兩個 JSON
```

### 使用建議

1. **大型專案優先使用**（>50 檔案）
2. **ShitScore 作為基準線**（設定改善目標，如 -10%）
3. **分階段驗證**（每階段執行 `npx tsc --noEmit`）
4. **善用快照壓縮**（作為重構前備份）

---

## 效益評估

**時間成本**：~3 小時（快照 < 10s、分析 5m、規劃 15m、重構 2h、驗證 30m）

**成果產出**：
- 消除 46 個 `any`
- TypeScript 編譯 0 錯誤
- ShitScore 改善 11%
- Type Safety 改善 35%
- 20 個檔案型別化

**投資回報**：
- 後續維護更安全
- 重構風險降低
- IDE 提示更準確
- 團隊協作更清晰

---

## 後續改善方向

基於快照分析識別：

1. **Pattern Duplication (48.39)**：抽取共用基礎方法
2. **Orphan Files (53.23)**：評估架構重組
3. **Dead Code (24.19)**：清理未使用 export
4. **Error Handling (0)**：建立錯誤處理層

---

## 總結

**有效**：
- ✅ 快速定位問題（8.7s 掃描 62 檔案）
- ✅ 量化改善成果（ShitScore 追蹤）
- ✅ 高效使用 token（壓縮快照 59k tokens）
- ✅ 輔助規劃策略（清晰結構與依賴圖）

**限制**：
- ⚠️ 無法替代完整程式碼閱讀
- ⚠️ 不能自動執行重構

**建議**：
- 🎯 大型專案必用（>50 檔案）
- 🎯 搭配分階段重構
- 🎯 持續追蹤改善指標
- 🎯 作為 CI/CD 品質門檻

**結論**：agent-ide 是 AI 輔助重構的強大工具，特別適合需要全局視角的程式碼品質改善專案。

---

## 相關文件

- [CLI 使用指南](cli-guide.md)
- [返回首頁](index.md)
