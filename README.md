# Agent IDE

> 📝 本文件由 AI Agent 生成

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

### CLI 命令

| 命令      | 功能                                   |
| --------- | -------------------------------------- |
| `search`  | 搜尋符號、文字、正則                   |
| `rename`  | 重新命名符號並更新引用                 |
| `move`    | 移動檔案並更新 import                  |
| `shift`   | 移動行（單檔案內/跨檔案/新檔案生成）   |
| `analyze` | 分析程式碼品質                         |
| `deps`    | 依賴關係分析、循環檢測                 |
| `shit`    | 垃圾度評分（0-100，越高越糟）          |

<details>
<summary>📖 使用指南</summary>

### 行移動（shift）

```bash
# 單檔案內移動（第 2-5 行移到第 10 行之前）
npx agent-ide shift src/file.ts --from 2 --to 5 --position 10

# 跨檔案移動
npx agent-ide shift src/old.ts --from 1 --to 3 --target src/new.ts --position 1

# 預覽模式
npx agent-ide shift src/file.ts --from 1 --to 5 --position 10 --preview

# JSON 輸出
npx agent-ide shift src/file.ts --from 1 --to 5 --position 10 --format json
```

### 檔案移動（move）

```bash
# 移動檔案並自動更新所有 import
npx agent-ide move src/old.ts src/new.ts

# 預覽影響範圍
npx agent-ide move src/old.ts src/new.ts --preview
```

### 符號重命名（rename）

```bash
# 重命名符號並更新所有引用
npx agent-ide rename --from oldName --to newName

# 預覽變更
npx agent-ide rename --from oldName --to newName --preview
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

### 垃圾度評分（shit）

```bash
# 基本評分（0-100，越高越糟）
npx agent-ide shit --format json

# 詳細分析（含 topShit + recommendations）
npx agent-ide shit --detailed --format json

# CI/CD 門檻檢查（超過則 exit 1）
npx agent-ide shit --max-allowed 70
```

</details>

> 💡 **Snapshot 功能詳解**：查看 [SNAPSHOT.md](./docs/SNAPSHOT.md) 了解如何使用快照功能完成 TypeScript 專案型別安全重構（ShitScore 改善 11%）

---

<details>
<summary>🏗️ 架構</summary>

```
Agent IDE
├── 核心模組：搜尋、重構、移動、依賴分析、ShitScore
├── 基礎設施：Parser 框架、索引引擎、快取、儲存
├── 插件系統：TypeScript、JavaScript、Swift
└── 介面層：CLI
```

**效能特色**：
- 增量索引（~1000 檔案/秒）
- 多層快取（查詢 <50ms）
- 並行處理
- 記憶體優化（~100MB / 10k 檔案）

**支援語言**：TypeScript、JavaScript、Swift

</details>

---

<details>
<summary>🧪 開發</summary>

```bash
pnpm install      # 安裝依賴
pnpm build        # 建置
pnpm test         # 測試（241 E2E 測試）
pnpm typecheck    # 型別檢查
pnpm lint         # ESLint
```

</details>

---

<details>
<summary>📖 文件</summary>

### 功能說明

- [**實戰指南**](./docs/GUIDE.md) - **綜合使用各功能完成新增/刪除/重構的完整案例**
- [Snapshot](./docs/SNAPSHOT.md) - 快照功能實戰指南，TypeScript 專案型別安全重構案例
- [Indexing](./docs/INDEXING.md) - 高效能程式碼索引引擎，增量索引與多層快取
- [Search](./docs/SEARCH.md) - 文字/符號/語義三種搜尋模式，支援正規表達式
- [Rename](./docs/RENAME.md) - 安全的符號重命名，自動更新所有引用
- [Move](./docs/MOVE.md) - 智能檔案移動，自動更新 import 路徑
- [Dependencies](./docs/DEPENDENCIES.md) - 依賴關係分析，循環依賴檢測與影響範圍
- [Quality](./docs/QUALITY.md) - 程式碼品質分析，ShitScore 評分與診斷

### 開發指南

- [API 文件](./API.md) - 完整 API 參考
- [貢獻指南](./CONTRIBUTING.md) - 開發指南
- [發布檢查清單](./PUBLISH_CHECKLIST.md) - 發布流程

</details>

---

<details>
<summary>📄 授權</summary>

MIT License - 查看 [LICENSE](LICENSE) 瞭解詳情

</details>

<details>
<summary>🤝 貢獻</summary>

歡迎貢獻！請查看 [CONTRIBUTING.md](./CONTRIBUTING.md)

- 🐛 [回報問題](https://github.com/vivalalova/agent-ide/issues)
- 💬 [參與討論](https://github.com/vivalalova/agent-ide/discussions)

</details>

---

**讓 AI 代理更聰明地理解和操作程式碼** 🤖✨
