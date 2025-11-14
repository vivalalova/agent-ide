# CLI 使用指南

> Agent IDE 命令列工具快速參考

## 安裝

```bash
# 從 npm
npm install -g agent-ide

# 從原始碼
git clone https://github.com/vivalalova/agent-ide.git
cd agent-ide
pnpm install && pnpm build && npm link

# 驗證
agent-ide --version
```

---

## 命令概覽

| 命令 | 功能 | 常用選項 |
|------|------|---------|
| `index` | 建立程式碼索引 | `-p <path>`, `-u` |
| `search` | 搜尋程式碼 | `-t <type>`, `--format json` |
| `rename` | 重命名符號 | `--from <old>`, `--to <new>`, `--preview` |
| `move` | 移動檔案 | `<source> <target>`, `--preview` |
| `shift` | 移動程式碼行 | `--from X`, `--to Y`, `--position Z` |
| `refactor` | 程式碼重構 | `extract-function`, `--preview` |
| `analyze` | 品質分析 | `complexity`, `dead-code`, `--format json` |
| `deps` | 依賴分析 | `--check-cycles`, `--format json` |
| `shit` | 垃圾度評分 | `--detailed`, `--max-allowed=70` |
| `plugins` | 插件管理 | `list`, `info <name>` |

---

## index - 程式碼索引

```bash
# 索引當前目錄
agent-ide index

# 索引指定專案
agent-ide index -p /path/to/project

# 增量更新
agent-ide index -u

# 自訂副檔名
agent-ide index -e ".ts,.tsx" -x "node_modules/**,dist/**"
```

---

## search - 程式碼搜尋

```bash
# 基本搜尋
agent-ide search "UserService"

# 正則表達式
agent-ide search "function.*User" -t regex

# 模糊搜尋
agent-ide search "usrserv" -t fuzzy

# 限制結果
agent-ide search "import" -l 10

# JSON 輸出
agent-ide search "UserService" --format json
```

**選項**：
- `-t, --type`: 搜尋類型（text|regex|fuzzy）
- `-l, --limit`: 結果數量限制
- `-c, --context`: 上下文行數
- `--case-sensitive`: 大小寫敏感
- `--format`: 輸出格式（list|json|minimal）

---

## rename - 符號重命名

```bash
# 預覽變更
agent-ide rename --from oldName --to newName --preview

# 執行重命名
agent-ide rename --from oldName --to newName

# 指定範圍
agent-ide rename --from oldName --to newName -p src/services

# 重命名函式
agent-ide rename -t function --from getUserData --to fetchUserData

# 重命名類別
agent-ide rename -t class --from UserService --to UserManager
```

**選項**：
- `-t, --type`: 符號類型（variable|function|class|interface）
- `-f, --from`: 原始名稱
- `-o, --to`: 新名稱
- `-p, --path`: 檔案或目錄路徑
- `--preview`: 預覽變更

---

## move - 檔案移動

```bash
# 移動檔案（自動更新 import）
agent-ide move src/old.ts src/new.ts

# 移動目錄
agent-ide move src/services src/core/services

# 預覽變更
agent-ide move src/old.ts src/new.ts --preview

# 移動但不更新 import
agent-ide move src/old.ts src/new.ts --update-imports=false
```

**選項**：
- `--update-imports`: 自動更新 import 路徑（預設 true）
- `--preview`: 預覽變更

---

## shift - 行移動

```bash
# 單檔案內移動
agent-ide shift src/file.ts --from 2 --to 5 --position 10

# 跨檔案移動
agent-ide shift src/old.ts --from 1 --to 3 --target src/new.ts --position 1

# 移動到新檔案
agent-ide shift src/file.ts --from 1 --to 5 --target src/newfile --position 1

# 預覽模式
agent-ide shift src/file.ts --from 1 --to 5 --position 10 --preview

# JSON 輸出
agent-ide shift src/file.ts --from 1 --to 5 --position 10 --format json
```

**選項**：
- `--from <number>`: 起始行號（1-based，包含）
- `--to <number>`: 結束行號（1-based，包含）
- `--position <number>`: 目標位置（插入到此行之前）
- `--target <file>`: 目標檔案路徑（選填）
- `--preview`: 預覽變更
- `--format`: 輸出格式（plain|json）

---

## refactor - 程式碼重構

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

**選項**：
- `-f, --file`: 檔案路徑
- `-s, --start-line`: 起始行號
- `-e, --end-line`: 結束行號
- `-n, --function-name`: 函式名稱
- `--preview`: 預覽變更

---

## analyze - 品質分析

```bash
# 分析當前目錄
agent-ide analyze

# 複雜度分析
agent-ide analyze complexity

# 死代碼檢測
agent-ide analyze dead-code

# JSON 輸出
agent-ide analyze complexity --format json

# 顯示所有檔案（包含無問題的）
agent-ide analyze complexity --format json --all

# 分析指定檔案
agent-ide analyze -p src/services/user.ts
```

**子命令**：
- `complexity`: 複雜度分析
- `quality`: 品質分析
- `dead-code`: 死代碼檢測
- `best-practices`: 最佳實踐檢查
- `all`: 完整分析

---

## deps - 依賴分析

```bash
# 完整依賴分析
agent-ide deps

# 依賴圖分析
agent-ide deps -t graph

# 循環依賴檢測
agent-ide deps -t cycles
agent-ide deps --check-cycles

# 影響範圍分析
agent-ide deps -t impact -f src/services/user.ts

# JSON 輸出
agent-ide deps --format json

# 顯示完整依賴圖（包含 nodes 和 edges）
agent-ide deps --format json --all

# DOT 格式（可視化）
agent-ide deps -t graph --format dot > deps.dot
```

**選項**：
- `-t, --type`: 分析類型（graph|cycles|impact|all）
- `-f, --file`: 特定檔案分析
- `--format`: 輸出格式（json|dot|summary）
- `--all`: 顯示完整結果

---

## shit - 垃圾度評分

```bash
# 基本評分（0-100，越高越糟）
agent-ide shit

# 詳細分析
agent-ide shit --detailed

# JSON 輸出
agent-ide shit --format json
agent-ide shit --detailed --format json

# 顯示前 20 個最糟項目
agent-ide shit --detailed --top=20 --format json

# CI/CD 門檻檢查
agent-ide shit --max-allowed=70
```

**評分維度**（CLAUDE.md 中有詳細說明）：
- Complexity (30%): 循環複雜度、函式長度
- Maintainability (30%): 死代碼、超大檔案
- Architecture (30%): 循環依賴、孤立檔案
- QA (20%): 型別安全、錯誤處理、命名

**評級系統**：
- A (0-29): 優秀
- B (30-49): 良好
- C (50-69): 需重構
- D (70-84): 強烈建議重構
- F (85-100): 建議重寫

---

## plugins - 插件管理

```bash
# 列出所有插件
agent-ide plugins list

# 查看插件資訊
agent-ide plugins info typescript

# 列出啟用的插件
agent-ide plugins list -f enabled
```

---

## 輸出格式

大多數命令支援多種輸出格式：

### list（列表）

人類可讀，包含檔案路徑、行號、上下文。

### json

結構化 JSON，便於程式解析：

```json
{
  "success": true,
  "data": { ... },
  "elapsed": "123ms"
}
```

### summary

精簡摘要，快速查看結果。

### table

表格格式，適合展示多筆資料。

---

## 效能考量

- **索引**：首次索引需數秒至數分鐘（取決於專案大小）
- **增量更新**：使用 `-u` 選項大幅提升速度
- **快取**：搜尋和分析使用快取，重複查詢更快
- **並行處理**：預設使用多執行緒

---

## 常見問題

### 索引失敗

檢查：檔案權限、排除模式、記憶體是否充足

### 搜尋結果過多

使用 `-l` 限制結果數量或更精確的搜尋條件

### 重命名沒有效果

確保：已建立索引、符號名稱正確、符號類型正確

---

## 相關文件

- [使用範例](examples.md)
- [實戰指南](GUIDE.md)
- [返回首頁](index.md)
