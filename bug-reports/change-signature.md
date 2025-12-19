# Agent-IDE change-signature 功能測試報告

## 測試環境

| 項目 | 內容 |
|------|------|
| 測試專案 | /Users/lova/git/AGGR/ems/backend (NestJS 後端) |
| Agent-IDE 版本 | 0.7.2 |
| 測試日期 | 2025-12-19 |
| TypeScript 版本 | 5.x |

## 測試項目與結果

### 1. --reorder 參數重新排序

**測試狀態：✅ 成功**

- 測試函式：影響範圍 31 個呼叫點、8 個檔案
- 結果：所有呼叫點的參數順序正確更新
- 行為：符合預期

```typescript
// 更新前
function getData(site: string, dateFrom: Date, dateTo: Date) {}
getData(site, dateFrom, dateTo);

// 更新後（重排為 dateFrom, dateTo, site）
function getData(dateFrom: Date, dateTo: Date, site: string) {}
getData(dateFrom, dateTo, site);
```

---

### 2. --add 新增參數

**測試狀態：⚠️ 部分成功（存在嚴重問題）**

#### 單行呼叫點：✅ 正確

```typescript
// 更新前
getData(site, dateFrom, dateTo);

// 更新後（新增 prefix: string | null）
getData(null, site, dateFrom, dateTo);
```

#### 多行呼叫點：🚨 嚴重錯誤

**問題描述：只更新第一行，導致參數錯位**

```typescript
// 更新前
getData(
  site,
  dateFrom,
  dateTo
);

// 更新後（錯誤！）
getData(null  // ❌ 只在第一行插入新參數
  site,       // 參數錯位
  dateFrom,
  dateTo
);

// 正確應為
getData(
  null,
  site,
  dateFrom,
  dateTo
);
```

**影響範圍：**
- 所有多行呼叫點
- 錯誤型態：參數錯位、執行時錯誤、型別檢查失敗

---

### 3. --remove 刪除參數

**測試狀態：✅ 成功**

- 正確從函式簽名移除參數
- 正確從所有呼叫點移除對應參數
- 單行和多行呼叫點皆正確處理

```typescript
// 更新前
function getData(prefix: string | null, site: string, dateFrom: Date) {}
getData(null, site, dateFrom);

// 更新後（移除 prefix）
function getData(site: string, dateFrom: Date) {}
getData(site, dateFrom);
```

---

### 4. --rename 重命名參數

**測試狀態：✅ 成功**

- 行為：只更新函式定義中的參數名稱
- 呼叫點不受影響（預期行為，因 TypeScript 支援位置參數）

```typescript
// 更新前
function getData(site: string, dateFrom: Date) {}

// 更新後（site → siteId）
function getData(siteId: string, dateFrom: Date) {}
// 呼叫點不變
getData(site, dateFrom);  // 仍然有效
```

---

### 5. --change-type 修改類型

**測試狀態：✅ 成功**

- 正確更新函式簽名中的參數型別
- 呼叫點不受影響（需手動調整呼叫端）

```typescript
// 更新前
function getData(site: string) {}

// 更新後（string → ObjectId）
function getData(site: ObjectId) {}
```

---

### 6. 可選參數處理

**測試狀態：🚨 存在問題**

#### 問題 A：允許無效的參數順序

```typescript
// TypeScript 規則：可選參數必須在必選參數之後
// 但 change-signature 未驗證此規則

// 更新前（合法）
function getData(site: string, prefix?: string) {}

// 更新後（非法！可選參數在前）
function getData(prefix?: string, site: string) {}  // ❌ TypeScript 編譯錯誤
```

#### 問題 B：省略可選參數的呼叫點產生語法錯誤

```typescript
// 更新前
function getData(site: string, prefix?: string) {}
getData(site);  // 省略 prefix

// 重排後（prefix 移到第一個）
function getData(prefix?: string, site: string) {}
getData(, site);  // ❌ 語法錯誤！逗號前缺少參數
```

---

## 發現的問題清單

### 嚴重問題（阻斷使用）

| # | 問題 | 影響 | 嚴重度 |
|---|------|------|--------|
| 1 | 多行呼叫點只更新第一行 | --add 功能不可用於多行呼叫 | 🔴 嚴重 |
| 2 | 可選參數重排產生語法錯誤 | --reorder 可能破壞程式碼 | 🔴 嚴重 |

### 中等問題

| # | 問題 | 影響 | 嚴重度 |
|---|------|------|--------|
| 3 | 未驗證可選參數順序規則 | 產生無法編譯的 TypeScript | 🟡 中等 |

### 輕微問題

| # | 問題 | 影響 | 嚴重度 |
|---|------|------|--------|
| 4 | 掃描 dist/ 目錄 | 效能浪費、重複掃描編譯產物 | 🟢 輕微 |

---

## 問題詳細分析

### 問題 #1：多行呼叫點只更新第一行

**重現步驟：**
```bash
agent-ide change-signature src/path/to/file.ts:10 \
  --add "prefix:string|null:null" \
  --apply
```

**預期行為：**
```typescript
getData(
  null,      // 新增參數
  site,
  dateFrom,
  dateTo
);
```

**實際行為：**
```typescript
getData(null  // 只在第一行插入
  site,
  dateFrom,
  dateTo
);
```

**根本原因：**
AST 轉換邏輯可能只處理首個參數位置，未考慮多行格式化。

---

### 問題 #2：可選參數重排產生語法錯誤

**重現步驟：**
```bash
# 原函式：getData(site: string, prefix?: string)
# 原呼叫：getData(site)

agent-ide change-signature src/path/to/file.ts:10 \
  --reorder "prefix,site" \
  --apply
```

**結果：**
```typescript
function getData(prefix?: string, site: string) {}  // ❌ 可選參數在前
getData(, site);  // ❌ 語法錯誤
```

**根本原因：**
- 未檢查 TypeScript 可選參數順序規則
- 未處理省略可選參數的呼叫點

---

### 問題 #3：未驗證可選參數順序規則

**建議修正：**
```typescript
// 應在重排前驗證
if (hasOptionalParams && requiredParamsAfterOptional) {
  throw new Error('可選參數必須在所有必選參數之後');
}
```

---

### 問題 #4：掃描 dist/ 目錄

**觀察：**
執行時會掃描 `dist/` 目錄，但該目錄是編譯產物。

**建議：**
預設排除常見建置目錄：
- `dist/`
- `build/`
- `node_modules/`
- `.next/`

---

## 使用建議

### 安全使用場景

| 功能 | 單行呼叫點 | 多行呼叫點 | 可選參數 |
|------|-----------|-----------|---------|
| --reorder | ✅ 安全 | ✅ 安全 | ⚠️ 避免 |
| --add | ✅ 安全 | 🚨 避免 | ✅ 安全 |
| --remove | ✅ 安全 | ✅ 安全 | ✅ 安全 |
| --rename | ✅ 安全 | ✅ 安全 | ✅ 安全 |
| --change-type | ✅ 安全 | ✅ 安全 | ✅ 安全 |

### 操作流程建議

```bash
# 1. 務必使用 --dry-run 預覽
agent-ide change-signature src/file.ts:10 \
  --add "newParam:string:defaultValue" \
  --dry-run

# 2. 檢查預覽結果：
#    - 多行呼叫點是否正確
#    - 可選參數順序是否合法
#    - 語法是否完整

# 3. 確認無誤後再 --apply
agent-ide change-signature src/file.ts:10 \
  --add "newParam:string:defaultValue" \
  --apply

# 4. 執行型別檢查
pnpm typecheck

# 5. 手動修復多行呼叫點（如有）
```

---

## 改進建議

### 優先級 P0（阻斷問題）

1. **修復多行呼叫點更新邏輯**
   - 正確處理跨行的 AST 節點
   - 測試案例：
     ```typescript
     functionCall(
       arg1,
       arg2,
       arg3
     )
     ```

2. **驗證可選參數順序**
   - 重排前檢查 TypeScript 規則
   - 拒絕產生非法簽名
   - 錯誤訊息：「可選參數 'prefix' 不能位於必選參數 'site' 之前」

3. **處理省略的可選參數**
   - 重排時正確插入 `undefined`
   - 範例：`getData(, site)` → `getData(undefined, site)`

### 優先級 P1（品質提升）

4. **預設排除建置目錄**
   ```json
   {
     "exclude": ["dist", "build", "node_modules", ".next"]
   }
   ```

5. **提供回滾機制**
   - 自動建立 git stash
   - 提供 `--rollback` 選項

6. **改進錯誤提示**
   - 明確指出哪些呼叫點更新失敗
   - 提供修復建議

---

## 測試覆蓋建議

建議新增以下測試案例：

```typescript
describe('change-signature', () => {
  describe('多行呼叫點', () => {
    it('should handle multi-line calls when adding parameter', () => {
      // 測試新增參數到多行呼叫
    });

    it('should handle multi-line calls when reordering', () => {
      // 測試重排多行呼叫參數
    });
  });

  describe('可選參數', () => {
    it('should reject reordering that puts optional before required', () => {
      // 驗證拒絕非法順序
    });

    it('should handle calls with omitted optional parameters', () => {
      // 測試省略可選參數的呼叫點
    });
  });

  describe('邊界案例', () => {
    it('should handle trailing commas', () => {
      // 測試尾隨逗號
    });

    it('should preserve comments in parameter list', () => {
      // 測試參數列表中的註解
    });
  });
});
```

---

## 總結

### 當前可用性評估

- **生產環境使用：⚠️ 有條件使用**
  - 單行呼叫點 + 無可選參數重排：可安全使用
  - 多行呼叫點：避免使用 `--add`
  - 可選參數重排：完全避免

- **建議工作流程：**
  1. 使用 `--dry-run` 預覽
  2. 檢查型別和語法
  3. 小範圍測試
  4. 手動修復邊界案例
  5. 執行完整測試套件

### 修復優先級

1. 🔴 P0：多行呼叫點更新邏輯
2. 🔴 P0：可選參數順序驗證
3. 🔴 P0：省略可選參數處理
4. 🟡 P1：排除建置目錄
5. 🟡 P1：改進錯誤訊息

修復上述問題後，`change-signature` 將成為強大的重構工具。
