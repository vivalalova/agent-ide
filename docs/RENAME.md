# Rename 功能說明

> 安全的符號重命名，自動更新所有引用

## 概述

Rename 功能提供安全的程式碼元素重命名，自動找出並更新所有引用位置，避免手動修改遺漏。

---

## 基本用法

```bash
# 預覽變更（預設 diff 格式）
agent-ide rename --from oldName --to newName --dry-run

# 預覽變更（JSON 格式）
agent-ide rename --from oldName --to newName --dry-run --format json

# 執行重命名
agent-ide rename --from oldName --to newName

# 指定範圍
agent-ide rename --from oldName --to newName -p src/services

# 重命名函式
agent-ide rename -t function --from getUserData --to fetchUserData

# 重命名類別
agent-ide rename -t class --from UserService --to UserManager
```

---

## 參數說明

| 參數 | 說明 | 必填 |
|------|------|------|
| `-f, --from` | 原始名稱 | 是 |
| `-o, --to` | 新名稱 | 是 |
| `-t, --type` | 符號類型（variable\|function\|class\|interface） | 否 |
| `-p, --path` | 檔案或目錄路徑 | 否 |
| `--dry-run` | 預覽變更而不執行 | 否 |
| `--format` | 輸出格式（diff\|json\|summary） | 否 |

---

## 輸出格式

### 預覽模式

```
Preview: Renaming 'getUserData' to 'fetchUserData'

定義位置:
  src/api/user.ts:45:12

引用位置 (8 個檔案, 23 處):
  src/services/user.service.ts (3 處)
  src/components/UserProfile.tsx (2 處)
  ...

摘要:
  - 定義: 1
  - 引用: 23
  - 影響檔案: 8
```

### 執行結果

```
✓ 重命名完成

更新檔案:
  src/api/user.ts (1 處)
  src/services/user.service.ts (3 處)
  src/components/UserProfile.tsx (2 處)
  ...

總計: 更新 8 個檔案、24 處引用
```

---

## 使用場景

### 1. API 重命名

```bash
# 預覽影響
agent-ide rename --from getUserData --to fetchUserProfile --preview

# 確認後執行
agent-ide rename --from getUserData --to fetchUserProfile

# 驗證
npm run typecheck && npm test
```

### 2. 類別重命名

```bash
agent-ide rename -t class --from UserService --to UserManager
```

### 3. 批量重命名

```bash
# 腳本批量處理
cat rename-list.txt | while IFS=',' read old new; do
  agent-ide rename --from "$old" --to "$new" --preview
done
```

---

## 最佳實踐

### 1. 預覽優先

```bash
# ✅ 先預覽
agent-ide rename --from old --to new --dry-run

# ❌ 直接執行
agent-ide rename --from old --to new
```

### 2. 驗證結果

```bash
# 重命名後驗證
npm run typecheck
npm test

# 搜尋確認
agent-ide search "oldName" --type symbol
# 應該找不到結果
```

### 3. 小範圍測試

```bash
# 先在小範圍測試
agent-ide rename --from old --to new -p src/test-module

# 確認無誤後全專案執行
agent-ide rename --from old --to new
```

---

## 相關文件

- [CLI 使用指南](cli-guide.md)
- [實戰指南](GUIDE.md)
- [返回首頁](index.md)
