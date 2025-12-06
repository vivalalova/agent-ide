# 符號引用搜尋 (find-references)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

語義級符號引用搜尋，精確找出符號的定義和所有引用位置。

## 為什麼使用 find-references？

| 優勢 | 說明 |
|------|------|
| **語義精確** | 區分定義、引用、import，不會混淆同名符號 |
| **跨檔案** | 自動搜尋整個專案的所有引用 |
| **結構化輸出** | JSON 格式，AI 可直接解析 |

## 用法

```bash
# 搜尋符號引用
agent-ide find-references processData --path . --format json

# 人類可讀格式
agent-ide find-references UserService --path . --format summary
```

## 參數

| 參數 | 說明 |
|------|------|
| `<symbol>` | 要搜尋的符號名稱 |
| `--path` | 專案路徑 |
| `--format` | 輸出格式：`json`、`summary` |

## 輸出格式

### json

```json
{
  "command": "find-references",
  "success": true,
  "symbol": "processData",
  "references": [
    {
      "file": "src/utils.ts",
      "line": 42,
      "column": 10,
      "type": "definition",
      "context": "export function processData(input: Data) {"
    },
    {
      "file": "src/main.ts",
      "line": 15,
      "column": 5,
      "type": "reference",
      "context": "const result = processData(input);"
    },
    {
      "file": "src/handler.ts",
      "line": 88,
      "column": 12,
      "type": "reference",
      "context": "await processData(data);"
    },
    {
      "file": "src/index.ts",
      "line": 3,
      "column": 10,
      "type": "import",
      "context": "import { processData } from './utils';"
    }
  ],
  "summary": {
    "totalReferences": 4,
    "definitions": 1,
    "references": 2,
    "imports": 1,
    "filesAffected": 4
  }
}
```

### summary

```
Symbol: processData

Definition:
  src/utils.ts:42 - export function processData(input: Data) {

References (3):
  src/main.ts:15 - const result = processData(input);
  src/handler.ts:88 - await processData(data);
  src/index.ts:3 - import { processData } from './utils';

Summary: 4 references in 4 files
```

## 引用類型

| 類型 | 說明 |
|------|------|
| `definition` | 符號的定義位置 |
| `reference` | 符號的使用位置 |
| `import` | import 語句中的引用 |

## 支援的符號類型

- 函數 / 方法
- 類別 / 結構體
- 介面 / 協議
- 變數 / 常數
- 型別別名
- 列舉
