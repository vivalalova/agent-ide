# Shift 功能說明

> 行級程式碼移動工具，支援單檔案內、跨檔案及新檔案生成

## 概述

Shift 提供精確的行級程式碼移動能力：單檔案內重排、跨檔案移動、新檔案生成。支援自動更新引用，在來源檔案中添加 import 提示，方便後續手動調整導入的符號。

### 核心特性

- 單檔案內移動：重新排列程式碼行
- 跨檔案移動：移動到已存在檔案
- 新檔案生成：必須提供完整檔名（包括副檔名）
- 自動更新引用：在來源檔案中添加 import 提示（預設啟用，可用 `--no-update-references` 禁用）
- 預覽模式、精確控制、多種輸出格式

---

## 基本用法

```bash
# 單檔案內移動（第 2-5 行移到第 10 行之前）
agent-ide shift src/file.ts --from 2 --to 5 --position 10

# 跨檔案移動
agent-ide shift src/old.ts --from 1 --to 3 --target src/new.ts --position 1

# 移動到新檔案（必須提供完整檔名，包括副檔名）
agent-ide shift src/file.ts --from 1 --to 5 --target src/newfile.ts --position 1

# 預覽模式
agent-ide shift src/file.ts --from 1 --to 5 --position 10 --preview

# JSON 輸出
agent-ide shift src/file.ts --from 1 --to 5 --position 10 --format json

# 禁用自動更新引用
agent-ide shift src/file.ts --from 1 --to 5 --target src/new.ts --position 1 --no-update-references
```

### 參數

| 參數 | 說明 | 必填 |
|------|------|------|
| `<file>` | 來源檔案路徑 | 是 |
| `--from <number>` | 起始行號（1-based，包含） | 是 |
| `--to <number>` | 結束行號（1-based，包含） | 是 |
| `--position <number>` | 目標位置行號（1-based，插入到此行之前） | 是 |
| `--target <file>` | 目標檔案路徑（必須包含副檔名，例如：newfile.ts） | 否 |
| `--update-references` | 自動更新引用（在來源檔案中添加 import 提示，預設：true） | 否 |
| `--no-update-references` | 禁用自動更新引用 | 否 |
| `--preview` | 預覽變更而不執行 | 否 |
| `--format <format>` | 輸出格式（plain\|json） | 否 |

---

## 輸出格式

**Plain 格式（預設）：**

```
✓ 行移動成功

來源檔案: src/file.ts
目標檔案: src/file.ts
移動範圍: 第 2-5 行
目標位置: 第 10 行之前
操作類型: 單檔案內移動

統計資訊:
  移動行數: 4 行
  操作耗時: 12ms
```

**JSON 格式：**

```json
{
  "success": true,
  "operationType": "within_file",
  "sourceFile": "src/file.ts",
  "fromLine": 2,
  "toLine": 5,
  "position": 10,
  "linesCount": 4
}
```

---

## 常見錯誤

```bash
# 1. 來源檔案不存在
# 錯誤：來源檔案不存在：src/nonexistent.ts

# 2. 無效行號範圍
# 錯誤：結束行號 (5) 不可小於起始行號 (10)
# 錯誤：起始行號 (1000) 超出檔案總行數 (100)

# 3. 無效插入位置
# 錯誤：插入位置必須 >= 1，實際值：0
# 錯誤：插入位置 (102) 超出有效範圍 (1-101)

# 4. 無需移動（目標位置在移動範圍內）
# 成功：目標位置在移動範圍內，無需移動

# 5. 目標檔案缺少副檔名
# 錯誤：目標檔案必須包含副檔名（例如：.ts, .js, .swift）
```

---

## 最佳實踐

### 1. 使用預覽模式

```bash
agent-ide shift src/file.ts --from 1 --to 10 --position 50 --preview
```

### 2. JSON 輸出用於自動化

```bash
result=$(agent-ide shift src/file.ts --from 1 --to 5 --position 10 --format json)
success=$(echo "$result" | jq -r '.success')
```

### 3. 邊界情況

```bash
# 移動單行
agent-ide shift src/file.ts --from 5 --to 5 --position 1

# 移動到檔案末尾（假設有 100 行）
agent-ide shift src/file.ts --from 1 --to 5 --position 101
```

### 4. 檔名命名

```bash
# ✅ 良好：描述性檔名（必須包含副檔名）
agent-ide shift src/user.ts --from 10 --to 50 --target src/user-helpers.ts --position 1

# ❌ 不良：無意義的檔名
agent-ide shift src/user.ts --from 10 --to 50 --target src/temp.ts --position 1

# ❌ 錯誤：缺少副檔名
agent-ide shift src/user.ts --from 10 --to 50 --target src/helpers --position 1
```

---

## 使用場景

### 程式碼重新組織

```bash
# 將工具函式移到檔案頂部
agent-ide shift src/app.ts --from 50 --to 80 --position 1
```

### 提取到新檔案

```bash
# 提取輔助函式（必須提供完整檔名）
agent-ide shift src/user.ts --from 100 --to 150 --target src/user-helpers.ts --position 1
```

### 合併分散的程式碼

```bash
# 合併到另一個檔案
agent-ide shift src/file1.ts --from 1 --to 20 --target src/file2.ts --position 1
```

### 調整檔案結構

```bash
# 調整 imports 位置
agent-ide shift src/types.ts --from 1 --to 10 --position 50
```

---

## 功能對比

| 功能 | Shift | Move | Refactor |
|------|-------|------|----------|
| **操作層級** | 行級 | 檔案級 | 語法級 |
| **跨檔案** | ✅ | ✅ | ❌ |
| **更新引用** | ✅（添加 import 提示） | ✅（完整更新） | ✅ |
| **新檔案生成** | ✅（需指定檔名） | ❌ | ❌ |
| **語法檢查** | ❌ | ✅ | ✅ |
| **適用場景** | 程式碼重排、快速提取片段 | 檔案移動、目錄重組 | 函式提取、內聯 |

**選擇建議**：

- **Shift**：行級別的程式碼移動，適合快速提取片段。會自動添加 import 提示（TODO 註解），需手動調整導入的符號
- **Move**：檔案級別的移動，完整更新所有引用，適合整個檔案的移動
- **Refactor**：語法級別的重構，完全基於語法分析，保證程式碼正確性

---

## 相關文件

- [Move 功能](MOVE.md) - 檔案移動與 import 更新
- [CLI 使用指南](cli-guide.md) - 完整的 CLI 命令參考
- [返回首頁](index.md)
