# Agent IDE 發布檢查清單

## 📋 發布前準備

### 1. 程式碼品質檢查
- [ ] 所有測試通過：`pnpm test`
- [ ] E2E 測試通過：`pnpm test:e2e`
- [ ] 型別檢查通過：`pnpm typecheck`
- [ ] Lint 檢查通過：`pnpm lint`
- [ ] 建置成功：`pnpm build`

### 2. 文件完整性
- [ ] README.md 已更新
- [ ] MCP_SETUP.md 已更新
- [ ] CLAUDE_CODE_INTEGRATION.md 已更新
- [ ] CHANGELOG.md 已更新版本資訊
- [ ] LICENSE 檔案存在

### 3. 套件設定檢查
- [ ] package.json 版本號正確
- [ ] package.json repository 正確：`https://github.com/vivalalova/agent-ide.git`
- [ ] package.json homepage 正確：`https://github.com/vivalalova/agent-ide`
- [ ] package.json bugs URL 正確
- [ ] package.json files 欄位包含必要檔案：`["dist", "bin", "README.md"]`
- [ ] package.json bin 命令正確：`agent-ide` 和 `agent-ide-mcp`
- [ ] .npmignore 已設定，排除測試檔案

### 4. MCP 設定檢查
- [ ] mcp.json 已建立
- [ ] mcp.json repository 正確
- [ ] mcp.json 工具列表完整（7個工具）
- [ ] mcp-config.example.json 已更新

### 5. 功能驗證
- [ ] CLI 工具正常執行：`agent-ide --help`
- [ ] MCP Server 正常啟動：`./scripts/test-mcp.sh`
- [ ] 索引功能正常
- [ ] 搜尋功能正常
- [ ] 重新命名功能正常（預覽模式）

---

## 📦 發布到 npm

### 步驟 1: 登入 npm
```bash
npm login
# 輸入帳號、密碼、Email、OTP
```

### 步驟 2: 最後檢查
```bash
# 確認要發布的檔案
npm pack --dry-run

# 檢查套件內容
tar -tzf agent-ide-0.1.0.tgz
```

### 步驟 3: 發布
```bash
# 發布到 npm（公開套件）
npm publish --access public

# 檢查發布結果
npm view agent-ide
```

### 步驟 4: 驗證安裝
```bash
# 全域安裝測試
npm install -g agent-ide

# 驗證命令
agent-ide --version
agent-ide-mcp --help

# 清理測試
npm uninstall -g agent-ide
```

---

## 🔌 提交到 MCP Registry

### 步驟 1: Fork MCP Registry
訪問：https://github.com/modelcontextprotocol/servers
點擊 Fork

### 步驟 2: 準備 PR
```bash
# Clone 你 fork 的 repository
git clone https://github.com/vivalalova/servers.git
cd servers

# 建立新分支
git checkout -b add-agent-ide

# 在適當位置新增 agent-ide
# 通常在 src/agent-ide/ 目錄下
mkdir -p src/agent-ide
```

### 步驟 3: 新增必要檔案
複製以下檔案到 `src/agent-ide/`：
- [ ] README.md（簡化版，說明安裝和使用）
- [ ] mcp.json（MCP 設定檔）
- [ ] 或參考 .github/MCP_REGISTRY_SUBMISSION.md

### 步驟 4: 更新 Registry 索引
編輯 `servers.json` 或相應的索引檔案，加入：
```json
{
  "agent-ide": {
    "name": "agent-ide",
    "description": "程式碼智能工具集 for AI Agents",
    "repository": "https://github.com/vivalalova/agent-ide",
    "npm": "agent-ide",
    "command": "agent-ide-mcp"
  }
}
```

### 步驟 5: 提交 PR
```bash
git add .
git commit -m "Add agent-ide MCP server"
git push origin add-agent-ide
```

然後在 GitHub 上建立 Pull Request

### 步驟 6: PR 描述
使用 `.github/MCP_REGISTRY_SUBMISSION.md` 的內容作為 PR 描述

---

## 🎉 發布後檢查

### npm 發布驗證
- [ ] 套件可以在 npmjs.com 找到
- [ ] 安裝正常：`npm install -g agent-ide`
- [ ] 命令正常執行：`agent-ide --version`
- [ ] MCP Server 正常啟動：`agent-ide-mcp`

### MCP Registry 提交追蹤
- [ ] PR 已提交
- [ ] PR 通過 CI/CD 檢查
- [ ] PR 被 merge
- [ ] 出現在 MCP Registry 列表中

### Claude Code 整合驗證
- [ ] 可以透過設定檔加入 agent-ide
- [ ] Claude Code 可以列出所有工具
- [ ] 工具可以正常執行
- [ ] 錯誤處理正常

---

## 📢 發布公告

### 準備公告內容
- [ ] 發布推文/社群貼文
- [ ] 更新 GitHub Releases
- [ ] 建立 CHANGELOG.md 條目
- [ ] 通知相關社群

### GitHub Release
```bash
# 建立 Git tag
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

然後在 GitHub 上建立 Release，使用 CHANGELOG.md 內容

---

## 🔄 版本更新流程

下次更新時：
1. 更新版本號：`package.json`, `mcp.json`
2. 更新 CHANGELOG.md
3. 執行此檢查清單
4. 發布：`npm publish`
5. 更新 MCP Registry（如有需要）

---

## 📝 注意事項

### npm 發布
- 套件名稱一旦發布就不能改變
- 版本號遵循 Semantic Versioning
- 發布後 24 小時內可以 unpublish
- 超過 24 小時後無法刪除，只能 deprecate

### MCP Registry
- PR 需要 MCP Registry 維護者審核
- 確保所有測試通過
- 文件要清楚完整
- 工具要能正常執行

### 安全性
- 不要在 npm 套件中包含敏感資訊
- 檢查 .npmignore 正確排除測試和開發檔案
- 確認 LICENSE 檔案存在

---

**準備發布？開始勾選檢查清單！** ✅
