# 成員移動 (move-member)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

移動程式碼成員（方法、函式、類別等）到新位置，自動更新所有引用。

## 用法

```bash
# 移動函式到現有檔案
agent-ide transform move-member src/utils.ts calculateSum --target-file src/math.ts --dry-run

# 移動函式到新檔案
agent-ide transform move-member src/utils.ts calculateSum --target-file src/math.ts --new-file --dry-run

# 移動類別方法到另一個類別
agent-ide transform move-member src/user.ts validateEmail --class User --target-file src/validator.ts --target-class Validator --dry-run

# 指定成員類型
agent-ide transform move-member src/types.ts UserDTO --type interface --target-file src/models.ts --dry-run

# 保留 re-export
agent-ide transform move-member src/utils.ts helper --target-file src/helpers.ts --keep-reexport --dry-run

# 執行移動
agent-ide transform move-member src/utils.ts calculateSum --target-file src/math.ts
```

## 參數

| 參數 | 說明 |
|------|------|
| `<sourceFile>` | 來源檔案路徑 |
| `<memberName>` | 成員名稱 |
| `--type` | 成員類型：`method`、`property`、`function`、`class`、`interface`、`type`、`constant`、`enum` |
| `--class` | 來源類別名稱（若為類別成員） |
| `--target-file` | 目標檔案路徑 |
| `--target-class` | 目標類別名稱（移動到類別內） |
| `--new-file` | 建立新檔案 |
| `--keep-reexport` | 保留原位置的 re-export |
| `--update-refs` | 更新所有引用（預設 true） |
| `--no-update-refs` | 不更新引用 |
| `--path` | 專案路徑（預設當前目錄） |
| `--dry-run` | 預覽模式，不實際執行 |
| `--format` | 輸出格式：`json`、`summary`、`diff` |

## 輸出格式

### diff（預設）

```diff
--- a/src/utils.ts
+++ b/src/utils.ts
（成員已移除）

+++ b/src/math.ts
（成員已加入）

引用更新: 3 個
  - src/calculator.ts
  - src/report.ts
  - src/index.ts

✅ 變更已執行
統計: 3 個引用, 5 個檔案
```

### summary

```
✅ 成員移動成功!
成員: calculateSum (function)
從: src/utils.ts
到: src/math.ts
統計: 更新了 3 個引用，影響 5 個檔案

🔍 預覽模式 - 執行時移除 --dry-run
```

### json

```json
{
  "success": true,
  "member": {
    "name": "calculateSum",
    "type": "function",
    "className": null
  },
  "sourceFileChange": {
    "filePath": "src/utils.ts"
  },
  "targetFileChange": {
    "filePath": "src/math.ts",
    "isNewFile": false
  },
  "referenceUpdates": 3,
  "executed": false,
  "stats": {
    "referencesUpdated": 3,
    "filesAffected": 5
  }
}
```

## 欄位說明

| 欄位 | 說明 |
|------|------|
| `member` | 移動的成員資訊 |
| `member.name` | 成員名稱 |
| `member.type` | 成員類型 |
| `member.className` | 所屬類別（若有） |
| `sourceFileChange` | 來源檔案變更 |
| `targetFileChange` | 目標檔案變更 |
| `targetFileChange.isNewFile` | 是否為新建檔案 |
| `referenceUpdates` | 引用更新數量 |
| `executed` | 是否已執行（false = dry-run） |
| `stats` | 統計資訊 |

## 支援的成員類型

| 類型 | 說明 |
|------|------|
| `function` | 獨立函式 |
| `class` | 類別定義 |
| `interface` | 介面定義 |
| `type` | 型別別名 |
| `constant` | 常數 |
| `enum` | 列舉 |
| `method` | 類別方法 |
| `property` | 類別屬性 |
