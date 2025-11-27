# Agent IDE

> 📝 本文件由 AI Agent 生成

**🎯 本專案致力於減少 AI Agent 的 token 使用量**

為 AI 代理設計的程式碼智能工具集，提供搜尋、重構、依賴分析等功能。

## 🚀 快速開始

### CLI 安裝

```bash
# 從 npm（發布後）
npm install -g agent-ide

# 從原始碼
git clone https://github.com/vivalalova/agent-ide.git
cd agent-ide
pnpm install && pnpm build && npm link
```

### Claude Code Skill 安裝

```bash
# 從 marketplace 安裝
/plugin marketplace add vivalalova/agent-ide
# 安裝 plugin
/plugin install agent-ide@vivalalova/agent-ide
```

### CLI 命令

| 命令       | 功能                                 | 格式選項            |
| ---------- | ------------------------------------ | ------------------- |
| `search`   | 搜尋符號、文字、正則                 | json, summary       |
| `rename`   | 重新命名符號並更新引用               | json, summary, diff |
| `move`     | 移動檔案並更新 import                | json, summary, diff |
| `shift`    | 移動行（單檔案內/跨檔案/新檔案生成） | json, summary, diff |
| `refactor` | 提取/內聯函式                        | json, summary, diff |
| `analyze`  | 分析程式碼品質                       | json, summary       |
| `deps`     | 依賴關係分析、循環檢測               | json, summary       |

<details>
<summary>📖 使用指南</summary>

### 行移動（shift）

```bash
# 單檔案內移動（第 2-5 行移到第 10 行之前）
npx agent-ide shift src/file.ts --from 2 --to 5 --position 10

# 跨檔案移動
npx agent-ide shift src/old.ts --from 1 --to 3 --target src/new.ts --position 1

# 預覽模式（--dry-run 預設輸出 diff 格式）
npx agent-ide shift src/file.ts --from 1 --to 5 --position 10 --dry-run

# JSON 輸出
npx agent-ide shift src/file.ts --from 1 --to 5 --position 10 --dry-run --format json
```

### 檔案移動（move）

```bash
# 移動檔案並自動更新所有 import
npx agent-ide move src/old.ts src/new.ts

# 預覽影響範圍
npx agent-ide move src/old.ts src/new.ts --dry-run
```

### 符號重命名（rename）

```bash
# 重命名符號並更新所有引用
npx agent-ide rename --from oldName --to newName

# 預覽變更
npx agent-ide rename --from oldName --to newName --dry-run
```

### 程式碼搜尋（search）

```bash
# 文字搜尋
npx agent-ide search "UserService" --format json

# 正規表達式搜尋
npx agent-ide search "function.*User" -t regex --format json

# 符號搜尋（function/class/variable/enum）
npx agent-ide search "User" -t class --format json
```

### 品質分析（analyze）

```bash
# 分析程式碼品質
npx agent-ide analyze --format json

# 顯示所有結果（包含無問題項目）
npx agent-ide analyze --format json --all
```

### 依賴關係（deps）

```bash
# 分析依賴關係（預設只顯示問題）
npx agent-ide deps --format json

# 顯示完整依賴圖
npx agent-ide deps --format json --all
```

</details>

---

<details>
<summary>📖 文件</summary>

- [**實戰指南**](./plugins/skills/agent-ide/references/guide.md) - 綜合使用各功能完成新增/刪除/重構的完整案例
- [CLI 使用指南](./docs/cli-guide.md) - 完整 CLI 命令參考與選項說明
- [Search](./docs/SEARCH.md) - 文字/符號/語義三種搜尋模式，支援正規表達式
- [Rename](./docs/RENAME.md) - 安全的符號重命名，自動更新所有引用
- [Move](./docs/MOVE.md) - 智能檔案移動，自動更新 import 路徑
- [Shift](./docs/SHIFT.md) - 行級程式碼移動，支援跨檔案與新檔案生成
- [Analyze](./docs/ANALYZE.md) - 程式碼品質分析，複雜度評估與死代碼檢測
- [Dependencies](./docs/DEPS.md) - 依賴關係分析，循環依賴檢測與影響範圍

</details>

---

<details>
<summary>📄 授權</summary>

MIT License - 查看 [LICENSE](LICENSE) 瞭解詳情

</details>

**讓 AI 代理更聰明地理解和操作程式碼** 🤖✨
