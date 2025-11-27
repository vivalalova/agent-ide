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
| `search` | 搜尋程式碼 | `-t <type>`, `--format json` |
| `rename` | 重命名符號 | `--from <old>`, `--to <new>`, `--dry-run` |
| `move` | 移動檔案 | `<source> <target>`, `--dry-run` |
| `shift` | 移動程式碼行 | `--from X`, `--to Y`, `--position Z`, `--dry-run` |
| `refactor` | 程式碼重構 | `extract-function`, `--dry-run` |
| `analyze` | 品質分析 | `complexity`, `dead-code`, `--format json` |
| `deps` | 依賴分析 | `--format json` |

### 統一輸出格式

所有命令支援 `--format` 參數：
- **json**：機器可讀 JSON 格式
- **summary**：人類可讀摘要格式
- **diff**：程式碼差異（僅變更類命令：rename/move/shift/refactor）

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
- `--format`: 輸出格式（json|summary）

---

## rename - 符號重命名

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

**選項**：
- `-t, --type`: 符號類型（variable|function|class|interface）
- `-f, --from`: 原始名稱
- `-o, --to`: 新名稱
- `-p, --path`: 檔案或目錄路徑
- `--dry-run`: 預覽變更而不執行
- `--format`: 輸出格式（diff|json|summary）

---

## move - 檔案移動

```bash
# 移動檔案（自動更新 import）
agent-ide move src/old.ts src/new.ts

# 移動目錄
agent-ide move src/services src/core/services

# 預覽變更（預設 diff 格式）
agent-ide move src/old.ts src/new.ts --dry-run

# 預覽變更（JSON 格式）
agent-ide move src/old.ts src/new.ts --dry-run --format json

# 移動但不更新 import
agent-ide move src/old.ts src/new.ts --update-imports=false
```

**選項**：
- `--update-imports`: 自動更新 import 路徑（預設 true）
- `--dry-run`: 預覽變更而不執行
- `--format`: 輸出格式（diff|json|summary）

---

## shift - 行移動

```bash
# 單檔案內移動
agent-ide shift src/file.ts --from 2 --to 5 --position 10

# 跨檔案移動
agent-ide shift src/old.ts --from 1 --to 3 --target src/new.ts --position 1

# 移動到新檔案
agent-ide shift src/file.ts --from 1 --to 5 --target src/newfile --position 1

# 預覽模式（預設 diff 格式）
agent-ide shift src/file.ts --from 1 --to 5 --position 10 --dry-run

# JSON 輸出
agent-ide shift src/file.ts --from 1 --to 5 --position 10 --dry-run --format json
```

**選項**：
- `--from <number>`: 起始行號（1-based，包含）
- `--to <number>`: 結束行號（1-based，包含）
- `--position <number>`: 目標位置（插入到此行之前）
- `--target <file>`: 目標檔案路徑（選填）
- `--dry-run`: 預覽變更而不執行
- `--format`: 輸出格式（diff|json|summary）

---

## refactor - 程式碼重構

```bash
# 提取函式
agent-ide refactor extract-function \
  -f src/app.ts \
  -s 10 \
  -e 20 \
  -n handleUserData

# 預覽重構（預設 diff 格式）
agent-ide refactor extract-function \
  -f src/app.ts \
  -s 10 \
  -e 20 \
  -n handleUserData \
  --dry-run

# 內聯函式
agent-ide refactor inline-function \
  -f src/app.ts \
  -n helperFunction
```

**選項**：
- `-f, --file`: 檔案路徑
- `-s, --start-line`: 起始行號
- `-e, --end-line`: 結束行號
- `-n, --function-name`: 函式名稱
- `--dry-run`: 預覽變更而不執行
- `--format`: 輸出格式（diff|json|summary）

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

# JSON 輸出
agent-ide deps --format json

# 顯示完整依賴圖（包含 nodes 和 edges）
agent-ide deps --format json --all
```

**選項**：
- `-p, --path`: 分析路徑
- `-f, --file`: 特定檔案分析
- `--format`: 輸出格式（json|summary）
- `--all`: 顯示完整結果（包含依賴圖）

---

## 輸出格式

所有命令支援統一的輸出格式：

### json

結構化 JSON，便於程式解析和自動化處理：

```json
{
  "command": "search",
  "success": true,
  "results": [...],
  "summary": { ... }
}
```

### summary

精簡摘要，人類可讀格式，快速查看結果。

### diff（僅變更類命令）

顯示程式碼差異，適用於 rename/move/shift/refactor 命令的 `--dry-run` 模式。

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

- [實戰指南](GUIDE.md)
- [返回首頁](index.md)
