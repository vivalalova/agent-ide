# 🚀 Agent IDE 發布指南

## 📦 現在可以發布了！

所有準備工作已完成，你可以開始發布 Agent IDE 到 npm 和 MCP Registry。

## 📋 快速發布步驟

### 1️⃣ 發布到 npm

```bash
# 登入 npm（如果還沒登入）
npm login

# 發布到 npm
npm publish --access public

# 驗證發布
npm view agent-ide
```

發布後，使用者就可以：
```bash
npm install -g agent-ide
```

### 2️⃣ 提交到 MCP Registry

**選項 A：使用準備好的文件**

1. Fork https://github.com/modelcontextprotocol/servers
2. 參考 `.github/MCP_REGISTRY_SUBMISSION.md` 建立 PR
3. 等待 MCP Registry 維護者審核

**選項 B：如果 MCP Registry 支援自動提交**

```bash
# 如果有 MCP CLI 工具
mcp register agent-ide
```

### 3️⃣ 驗證安裝

發布後測試：

```bash
# 測試 npm 安裝
npm install -g agent-ide
agent-ide --version
agent-ide-mcp

# 測試 Claude Code 整合
# 編輯 ~/.config/claude/mcp_settings.json
{
  "mcpServers": {
    "agent-ide": {
      "command": "agent-ide-mcp",
      "args": [],
      "env": {}
    }
  }
}

# 重啟 Claude Code 並驗證
```

## 📚 準備好的文件

✅ **mcp.json** - MCP 設定檔
✅ **.npmignore** - npm 發布排除清單
✅ **package.json** - 包含所有必要資訊
✅ **PUBLISH_CHECKLIST.md** - 詳細檢查清單
✅ **.github/MCP_REGISTRY_SUBMISSION.md** - MCP PR 文件

## 🔗 發布後的連結

發布成功後，這些連結將會生效：

- **npm 套件**: https://www.npmjs.com/package/agent-ide
- **GitHub**: https://github.com/vivalalova/agent-ide
- **Issues**: https://github.com/vivalalova/agent-ide/issues
- **Discussions**: https://github.com/vivalalova/agent-ide/discussions

## ⚠️ 注意事項

### npm 發布
- 首次發布需要 `--access public`
- 版本號無法重複使用
- 發布後 24 小時內可以 unpublish

### MCP Registry
- 需要維護者審核 PR
- 確保所有測試通過
- 文件要清楚完整

## 🎉 發布後

1. **更新 README Badge**（可選）
   ```markdown
   ![npm version](https://img.shields.io/npm/v/agent-ide)
   ![npm downloads](https://img.shields.io/npm/dm/agent-ide)
   ```

2. **建立 GitHub Release**
   ```bash
   git tag -a v0.1.0 -m "Release v0.1.0"
   git push origin v0.1.0
   ```
   然後在 GitHub 上建立 Release

3. **公告**
   - 在 GitHub Discussions 發布公告
   - 更新相關文件
   - 通知使用者

## 📖 相關文件

- [PUBLISH_CHECKLIST.md](./PUBLISH_CHECKLIST.md) - 完整檢查清單
- [.github/MCP_REGISTRY_SUBMISSION.md](./.github/MCP_REGISTRY_SUBMISSION.md) - MCP PR 文件
- [README.md](./README.md) - 專案說明

---

**準備好了嗎？開始發布吧！** 🚀
