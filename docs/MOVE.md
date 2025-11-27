# Move 功能說明

> 智能檔案移動，自動更新所有 import 路徑

## 概述

Move 功能提供安全的檔案移動能力，自動追蹤並更新所有依賴此檔案的 import 語句。

---

## 基本用法

```bash
# 移動檔案（自動更新 import）
agent-ide move src/old.ts src/new.ts

# 移動目錄
agent-ide move src/api src/services/api

# 預覽影響範圍（預設 diff 格式）
agent-ide move src/old.ts src/new.ts --dry-run

# 預覽影響範圍（JSON 格式）
agent-ide move src/old.ts src/new.ts --dry-run --format json

# 移動但不更新 import
agent-ide move src/old.ts src/new.ts --update-imports=false
```

**選項**：
- `--dry-run`: 預覽變更而不執行
- `--format`: 輸出格式（diff|json|summary）
- `--update-imports`: 自動更新 import 路徑（預設 true）

---

## 批量移動

**move-list.json**:
```json
[
  {"from": "src/api/user.ts", "to": "src/services/user.service.ts"},
  {"from": "src/api/post.ts", "to": "src/services/post.service.ts"}
]
```

---

## 輸出格式

### 預覽模式

```
Preview: Moving src/services/user.ts → src/core/services/user.ts

需要更新的檔案 (12 個):
  src/components/UserProfile.tsx:
    - import { getUser } from '../services/user'
    + import { getUser } from '../core/services/user'
  ...
```

### 執行結果

```
✓ 檔案移動成功

從: src/services/user.ts
到: src/core/services/user.ts

更新的 import 路徑:
  src/controllers/user.ts:3
  src/components/UserProfile.tsx:5
  ...

✓ 共更新 12 個檔案
```

---

## 使用場景

### 1. 重組目錄結構

```bash
# 預覽移動
agent-ide move src/api src/services --preview

# 確認後執行
agent-ide move src/api src/services

# 驗證
npm run build && npm test
```

### 2. 批量移動

```bash
# 創建移動清單並執行
agent-ide move --batch move-list.json
```

---

## 最佳實踐

### 1. 預覽優先

```bash
# ✅ 先預覽
agent-ide move old.ts new.ts --dry-run

# ❌ 直接執行
agent-ide move old.ts new.ts
```

### 2. 驗證結果

```bash
# 移動後驗證
npm run typecheck
npm test

# 檢查循環依賴
agent-ide deps cycles
```

### 3. 檢查影響範圍

```bash
# 移動前評估影響
agent-ide deps -t impact -f target-file.ts
```

---

## 相關文件

- [CLI 使用指南](cli-guide.md)
- [Shift 功能](SHIFT.md) - 行級移動
- [實戰指南](GUIDE.md)
- [返回首頁](index.md)
