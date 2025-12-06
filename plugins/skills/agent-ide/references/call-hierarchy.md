# 呼叫層次分析 (call-hierarchy)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

分析函數的呼叫層次，顯示誰呼叫此函數（incoming）和此函數呼叫誰（outgoing）。

## 為什麼使用 call-hierarchy？

| 優勢 | 說明 |
|------|------|
| **理解流程** | 快速了解程式碼執行流程 |
| **影響評估** | 修改前評估影響範圍 |
| **多層深度** | 支援多層呼叫鏈展開 |

## 用法

```bash
# 分析雙向呼叫層次
agent-ide call-hierarchy handleRequest --path . --direction both

# 只看誰呼叫此函數
agent-ide call-hierarchy processData --path . --direction incoming

# 只看此函數呼叫誰
agent-ide call-hierarchy validateInput --path . --direction outgoing

# 指定展開深度
agent-ide call-hierarchy main --path . --depth 3 --format json
```

## 參數

| 參數 | 說明 | 預設值 |
|------|------|-------|
| `<function>` | 要分析的函數名稱 | - |
| `--path` | 專案路徑 | - |
| `--direction` | 方向：`incoming`、`outgoing`、`both` | `both` |
| `--depth` | 展開深度 | 2 |
| `--format` | 輸出格式：`json`、`summary` | `json` |

## 輸出格式

### json

```json
{
  "command": "call-hierarchy",
  "success": true,
  "function": "handleRequest",
  "file": "src/handler.ts",
  "incoming": [
    {
      "caller": "main",
      "file": "src/index.ts",
      "line": 10,
      "context": "handleRequest(req, res);"
    },
    {
      "caller": "router.get",
      "file": "src/routes.ts",
      "line": 25,
      "context": "router.get('/api', handleRequest);"
    }
  ],
  "outgoing": [
    {
      "callee": "validateInput",
      "file": "src/validator.ts",
      "line": 5,
      "context": "validateInput(req.body)"
    },
    {
      "callee": "processData",
      "file": "src/utils.ts",
      "line": 42,
      "context": "processData(validatedData)"
    },
    {
      "callee": "sendResponse",
      "file": "src/response.ts",
      "line": 18,
      "context": "sendResponse(res, result)"
    }
  ],
  "summary": {
    "incomingCount": 2,
    "outgoingCount": 3
  }
}
```

### summary

```
Function: handleRequest (src/handler.ts)

Incoming (2 callers):
  <- main (src/index.ts:10)
  <- router.get (src/routes.ts:25)

Outgoing (3 callees):
  -> validateInput (src/validator.ts:5)
  -> processData (src/utils.ts:42)
  -> sendResponse (src/response.ts:18)
```

## 使用場景

### 1. 重構前評估

```bash
# 修改 processData 前，先了解影響範圍
agent-ide call-hierarchy processData --path . --direction incoming
```

### 2. 理解程式碼流程

```bash
# 從入口點開始追蹤呼叫鏈
agent-ide call-hierarchy main --path . --direction outgoing --depth 3
```

### 3. 搭配 find-references

```bash
# 先找引用，再分析呼叫層次
agent-ide find-references UserService --path .
agent-ide call-hierarchy createUser --path . --direction both
```

## 與其他命令的關係

| 命令 | 用途 | 差異 |
|------|------|------|
| `snapshot` | 看專案結構 | 模組層級 |
| `find-references` | 找符號引用 | 所有引用位置 |
| `call-hierarchy` | 看呼叫流程 | 函數呼叫關係 |
| `impact` | 檔案依賴 | 檔案層級 |
