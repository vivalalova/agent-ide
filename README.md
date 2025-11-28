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

## 📖 文件

- [**快速參考**](./plugins/skills/agent-ide/SKILL.md) - 命令速查表
- [**完整指南**](./plugins/skills/agent-ide/references/guide.md) - 詳細使用說明與範例

## 📄 授權

MIT License - 查看 [LICENSE](LICENSE)

---

**讓 AI 代理更聰明地理解和操作程式碼** 🤖✨
