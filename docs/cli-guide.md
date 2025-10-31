# CLI 使用指南

> 📝 本文件由 AI Agent 生成

完整的 Agent IDE 命令列工具使用指南。

## 目錄

- [安裝](#安裝)
- [通用選項](#通用選項)
- [命令列表](#命令列表)
  - [index - 程式碼索引](#index---程式碼索引)
  - [search - 程式碼搜尋](#search---程式碼搜尋)
  - [rename - 符號重命名](#rename---符號重命名)
  - [move - 檔案移動](#move---檔案移動)
  - [refactor - 程式碼重構](#refactor---程式碼重構)
  - [analyze - 品質分析](#analyze---品質分析)
  - [deps - 依賴分析](#deps---依賴分析)
  - [plugins - 插件管理](#plugins---插件管理)

## 安裝

### 從 npm（發布後）

```bash
npm install -g agent-ide
```

### 從原始碼

```bash
git clone https://github.com/vivalalova/agent-ide.git
cd agent-ide
pnpm install && pnpm build && npm link
```

### 驗證安裝

```bash
agent-ide --version
agent-ide --help
```

## 通用選項

所有命令都支援以下選項：

- `-V, --version`：顯示版本號
- `-h, --help`：顯示說明文件

## 命令列表

### index - 程式碼索引

建立或更新程式碼索引，為搜尋和分析功能提供基礎。

#### 語法

```bash
agent-ide index [options]
```

#### 選項

| 選項 | 說明 | 預設值 |
|------|------|--------|
| `-p, --path <path>` | 專案路徑 | 當前目錄 |
| `-u, --update` | 增量更新索引 | false |
| `-e, --extensions <exts>` | 包含的檔案副檔名 | `.ts,.js,.tsx,.jsx` |
| `-x, --exclude <patterns>` | 排除模式 | `node_modules/**,*.test.*` |

#### 範例

```bash
# 索引當前目錄
agent-ide index

# 索引指定專案
agent-ide index -p /path/to/project

# 增量更新索引
agent-ide index -u

# 自訂副檔名和排除模式
agent-ide index -e ".ts,.tsx" -x "node_modules/**,dist/**"
```

#### 輸出

```
✓ 索引建立成功
  檔案數: 1234
  符號數: 5678
  耗時: 1.23s
```

---

### search - 程式碼搜尋

在程式碼中搜尋符號、文字或正則表達式。

#### 語法

```bash
agent-ide search [options] <query>
```

#### 參數

| 參數 | 說明 | 必填 |
|------|------|------|
| `query` | 搜尋查詢 | 是 |

#### 選項

| 選項 | 說明 | 預設值 |
|------|------|--------|
| `-t, --type <type>` | 搜尋類型（text\|regex\|fuzzy） | `text` |
| `-p, --path <path>` | 搜尋路徑 | `.` |
| `-e, --extensions <exts>` | 檔案副檔名 | `.ts,.js,.tsx,.jsx` |
| `-l, --limit <num>` | 結果數量限制 | `50` |
| `-c, --context <lines>` | 上下文行數 | `2` |
| `--case-sensitive` | 大小寫敏感 | false |
| `--whole-word` | 全字匹配 | false |
| `--multiline` | 多行匹配 | false |
| `--include <patterns>` | 包含模式 | - |
| `--exclude <patterns>` | 排除模式 | `node_modules/**,*.test.*` |
| `--format <format>` | 輸出格式（list\|json\|minimal） | `list` |

#### 範例

```bash
# 基本搜尋
agent-ide search "UserService"

# 正則表達式搜尋
agent-ide search "function.*User" -t regex

# 模糊搜尋
agent-ide search "usrserv" -t fuzzy

# 限制結果數量
agent-ide search "import" -l 10

# 大小寫敏感搜尋
agent-ide search "UserService" --case-sensitive

# JSON 輸出（便於解析）
agent-ide search "UserService" --format json

# 顯示上下文
agent-ide search "export" -c 5
```

#### 輸出範例

**列表格式（預設）：**

```
src/services/user.ts:15:7
  13 |
  14 | export class UserService {
  15 |   private repository: UserRepository;
  16 |
  17 |   constructor(repository: UserRepository) {

src/services/auth.ts:8:24
   6 |
   7 | export class AuthService {
   8 |   constructor(private userService: UserService) {}
   9 |
  10 |   async authenticate(credentials: Credentials) {
```

**JSON 格式：**

```json
{
  "query": "UserService",
  "type": "text",
  "results": [
    {
      "file": "src/services/user.ts",
      "line": 15,
      "column": 7,
      "content": "export class UserService {",
      "context": {
        "before": ["", "export class UserService {"],
        "after": ["  private repository: UserRepository;", ""]
      }
    }
  ],
  "total": 12,
  "elapsed": "45ms"
}
```

---

### rename - 符號重命名

安全地重新命名程式碼元素，自動更新所有引用。

#### 語法

```bash
agent-ide rename [options]
```

#### 選項

| 選項 | 說明 | 預設值 |
|------|------|--------|
| `-t, --type <type>` | 符號類型（variable\|function\|class\|interface） | `variable` |
| `-f, --from <name>` | 原始名稱 | - |
| `-o, --to <name>` | 新名稱 | - |
| `-p, --path <path>` | 檔案或目錄路徑 | `.` |
| `--preview` | 預覽變更而不執行 | false |

#### 範例

```bash
# 重新命名變數
agent-ide rename -f oldName -o newName

# 重新命名函式
agent-ide rename -t function -f getUserData -o fetchUserData

# 重新命名類別
agent-ide rename -t class -f UserService -o UserManager

# 預覽變更
agent-ide rename -f oldName -o newName --preview

# 指定範圍
agent-ide rename -f oldName -o newName -p src/services
```

#### 輸出

```
✓ 找到 15 個引用

變更預覽：
  src/services/user.ts:10:7
    - const oldName = 'test';
    + const newName = 'test';

  src/services/user.ts:15:12
    - console.log(oldName);
    + console.log(newName);

  ... (還有 13 個變更)

✓ 重新命名完成
  檔案數: 8
  變更數: 15
```

---

### move - 檔案移動

移動檔案或目錄，自動更新所有 import 路徑。

#### 語法

```bash
agent-ide move [options] <source> <target>
```

#### 參數

| 參數 | 說明 | 必填 |
|------|------|------|
| `source` | 來源路徑 | 是 |
| `target` | 目標路徑 | 是 |

#### 選項

| 選項 | 說明 | 預設值 |
|------|------|--------|
| `--update-imports` | 自動更新 import 路徑 | `true` |
| `--preview` | 預覽變更而不執行 | false |

#### 範例

```bash
# 移動檔案
agent-ide move src/old.ts src/new.ts

# 移動目錄
agent-ide move src/services src/core/services

# 預覽變更
agent-ide move src/old.ts src/new.ts --preview

# 移動但不更新 import
agent-ide move src/old.ts src/new.ts --update-imports=false
```

#### 輸出

```
✓ 檔案移動成功

從: src/services/user.ts
到: src/core/services/user.ts

更新的 import 路徑：
  src/controllers/user.ts:3
    - import { UserService } from '../services/user';
    + import { UserService } from '../core/services/user';

  src/app.ts:5
    - import { UserService } from './services/user';
    + import { UserService } from './core/services/user';

✓ 共更新 12 個檔案
```

---

### refactor - 程式碼重構

執行程式碼重構操作，如提取函式、內聯函式等。

#### 語法

```bash
agent-ide refactor [options] <action>
```

#### 參數

| 參數 | 說明 | 可選值 |
|------|------|--------|
| `action` | 重構動作 | `extract-function`、`inline-function` |

#### 選項

| 選項 | 說明 | 必填 |
|------|------|------|
| `-f, --file <file>` | 檔案路徑 | 是（extract-function） |
| `-s, --start-line <line>` | 起始行號 | 是（extract-function） |
| `-e, --end-line <line>` | 結束行號 | 是（extract-function） |
| `-n, --function-name <name>` | 函式名稱 | 是（extract-function） |
| `-p, --path <path>` | 專案路徑 | 否 |
| `--preview` | 預覽變更而不執行 | false |

#### 範例

```bash
# 提取函式
agent-ide refactor extract-function \
  -f src/app.ts \
  -s 10 \
  -e 20 \
  -n handleUserData

# 預覽重構
agent-ide refactor extract-function \
  -f src/app.ts \
  -s 10 \
  -e 20 \
  -n handleUserData \
  --preview
```

#### 輸出

```
✓ 函式提取成功

提取的程式碼：
  行 10-20 from src/app.ts

新函式：
  function handleUserData(user: User) {
    // 提取的程式碼
  }

✓ 原始位置已替換為函式呼叫
```

---

### analyze - 品質分析

分析程式碼品質、複雜度和相關指標。

#### 語法

```bash
agent-ide analyze [options] [type]
```

#### 參數

| 參數 | 說明 | 可選值 |
|------|------|--------|
| `type` | 分析類型 | `complexity`、`quality`、`all` |

#### 選項

| 選項 | 說明 | 預設值 |
|------|------|--------|
| `-p, --path <path>` | 分析路徑 | `.` |
| `--pattern <pattern>` | 分析模式 | - |
| `--format <format>` | 輸出格式（json\|table\|summary） | `summary` |

#### 範例

```bash
# 分析當前目錄
agent-ide analyze

# 分析複雜度
agent-ide analyze complexity

# 分析品質
agent-ide analyze quality

# 分析指定檔案
agent-ide analyze -p src/services/user.ts

# JSON 輸出
agent-ide analyze --format json
```

#### 輸出範例

**摘要格式：**

```
程式碼品質分析報告

檔案: src/services/user.ts

複雜度分析：
  循環複雜度: 8 (中等)
  認知複雜度: 12 (中等)
  評估: 可接受

品質指標：
  可維護性指數: 65.4 (中等)
  等級: B
  程式碼行數: 234
  註解覆蓋率: 15.2%

建議：
  - 考慮拆分 processUserData 函式（複雜度 12）
  - 增加程式碼註解
```

**JSON 格式：**

```json
{
  "file": "src/services/user.ts",
  "complexity": {
    "cyclomaticComplexity": 8,
    "cognitiveComplexity": 12,
    "evaluation": "medium"
  },
  "quality": {
    "maintainabilityIndex": 65.4,
    "grade": "B",
    "linesOfCode": 234,
    "commentDensity": 15.2
  },
  "issues": [
    {
      "type": "complexity",
      "severity": "warning",
      "message": "Function 'processUserData' has high complexity (12)"
    }
  ]
}
```

---

### deps - 依賴分析

分析程式碼依賴關係，檢測循環依賴和影響範圍。

#### 語法

```bash
agent-ide deps [options]
```

#### 選項

| 選項 | 說明 | 預設值 |
|------|------|--------|
| `-p, --path <path>` | 分析路徑 | `.` |
| `-t, --type <type>` | 分析類型（graph\|cycles\|impact\|all） | - |
| `-f, --file <file>` | 特定檔案分析（用於影響分析） | - |
| `--format <format>` | 輸出格式（json\|dot\|summary） | `summary` |

#### 範例

```bash
# 完整依賴分析
agent-ide deps

# 依賴圖分析
agent-ide deps -t graph

# 循環依賴檢測
agent-ide deps -t cycles

# 影響範圍分析
agent-ide deps -t impact -f src/services/user.ts

# DOT 格式輸出（可視化）
agent-ide deps -t graph --format dot > deps.dot
```

#### 輸出範例

**摘要格式：**

```
依賴關係分析報告

專案: /path/to/project

依賴圖統計：
  總檔案數: 234
  總依賴數: 456
  平均每檔案依賴數: 1.95
  最大依賴數: 15 (src/app.ts)

循環依賴：
  ⚠ 發現 3 個循環依賴

  1. src/services/user.ts
     → src/services/auth.ts
     → src/services/user.ts

  2. src/models/user.ts
     → src/models/post.ts
     → src/models/user.ts

孤立檔案：
  - src/utils/legacy.ts
  - src/types/deprecated.ts

影響分析（src/services/user.ts）：
  直接影響: 8 個檔案
  間接影響: 23 個檔案
  影響分數: 7.5/10 (高)
```

**DOT 格式（可視化）：**

```dot
digraph dependencies {
  "src/app.ts" -> "src/services/user.ts";
  "src/app.ts" -> "src/services/auth.ts";
  "src/services/auth.ts" -> "src/services/user.ts";
  ...
}
```

---

### plugins - 插件管理

管理 Parser 插件，查看和操作插件狀態。

#### 語法

```bash
agent-ide plugins [command]
```

#### 子命令

| 命令 | 說明 |
|------|------|
| `list` | 列出所有插件 |
| `info <plugin>` | 顯示插件資訊 |

#### list 選項

| 選項 | 說明 | 預設值 |
|------|------|--------|
| `-f, --filter <filter>` | 過濾條件（all\|enabled\|disabled） | `all` |

#### 範例

```bash
# 列出所有插件
agent-ide plugins list

# 查看插件資訊
agent-ide plugins info typescript

# 列出啟用的插件
agent-ide plugins list -f enabled
```

#### 輸出

```
已安裝的 Parser 插件

名稱         版本    支援語言      副檔名
─────────────────────────────────────────────
typescript   1.0.0   TypeScript    .ts, .tsx
javascript   1.0.0   JavaScript    .js, .jsx
swift        1.0.0   Swift         .swift

總計: 3 個插件
```

---

## 輸出格式

大多數命令都支援多種輸出格式：

### list（列表）

人類可讀的格式，包含檔案路徑、行號、上下文等。

### json

結構化的 JSON 格式，便於程式解析和自動化處理。

```json
{
  "success": true,
  "data": { ... },
  "elapsed": "123ms"
}
```

### summary

精簡的摘要資訊，適合快速查看結果。

### table

表格格式，適合展示多筆資料。

## 效能考量

- **索引**：首次索引可能需要數秒至數分鐘，取決於專案大小
- **增量更新**：使用 `-u` 選項可大幅提升更新速度
- **快取**：搜尋和分析操作會使用快取，重複查詢更快
- **並行處理**：預設會使用多執行緒處理，可加快大型專案的處理速度

## 常見問題

### 索引失敗

如果索引建立失敗，檢查：
- 檔案權限
- 排除模式是否正確
- 記憶體是否充足

### 搜尋結果過多

使用 `-l` 選項限制結果數量，或使用更精確的搜尋條件。

### 重命名沒有效果

確保：
- 已建立索引
- 符號名稱正確
- 符號類型正確

## 相關文件

- [使用範例](examples.md)
- [返回首頁](index.md)
