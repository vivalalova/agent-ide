# 發布檢查清單

## 發布前檢查

### 程式碼品質
- [ ] `pnpm test` 所有測試通過
- [ ] `pnpm test:e2e` E2E 測試通過
- [ ] `pnpm typecheck` 型別檢查通過
- [ ] `pnpm lint` Lint 檢查通過
- [ ] `pnpm build` 建置成功

### 文件完整性
- [ ] README.md 已更新
- [ ] CHANGELOG.md 已更新版本資訊
- [ ] LICENSE 檔案存在

### 套件設定
- [ ] `package.json` 版本號正確
- [ ] `package.json` repository: `https://github.com/vivalalova/agent-ide.git`
- [ ] `package.json` homepage: `https://github.com/vivalalova/agent-ide`
- [ ] `package.json` bugs URL 正確
- [ ] `package.json` files: `["dist", "bin", "README.md"]`
- [ ] `package.json` bin: `agent-ide`, `agent-ide-mcp`
- [ ] `.npmignore` 已設定

### MCP 設定
- [ ] `mcp.json` 已建立
- [ ] `mcp.json` repository 正確
- [ ] `mcp.json` 工具列表完整（7個）

### 功能驗證
- [ ] `agent-ide --help` 正常執行
- [ ] `./scripts/test-mcp.sh` MCP Server 正常
- [ ] 索引功能正常
- [ ] 搜尋功能正常
- [ ] 重新命名功能正常（預覽模式）

---

## 發布到 npm

```bash
# 1. 登入
npm login

# 2. 檢查內容
npm pack --dry-run
tar -tzf agent-ide-0.1.0.tgz

# 3. 發布
npm publish --access public

# 4. 驗證
npm view agent-ide
npm install -g agent-ide
agent-ide --version
agent-ide-mcp
```

---

## 提交到 MCP Registry

```bash
# 1. Fork
# https://github.com/modelcontextprotocol/servers

# 2. Clone
git clone https://github.com/vivalalova/servers.git
cd servers
git checkout -b add-agent-ide

# 3. 新增檔案到適當位置
# 參考 .github/MCP_REGISTRY_SUBMISSION.md

# 4. 提交
git add .
git commit -m "Add agent-ide MCP server"
git push origin add-agent-ide

# 5. 建立 PR
# 使用 .github/MCP_REGISTRY_SUBMISSION.md 作為 PR 描述
```

---

## 發布後驗證

### npm 驗證
- [ ] 套件可在 npmjs.com 找到
- [ ] `npm install -g agent-ide` 安裝正常
- [ ] `agent-ide --version` 正常執行
- [ ] `agent-ide-mcp` MCP Server 正常啟動

### MCP Registry
- [ ] PR 已提交
- [ ] PR 通過 CI/CD
- [ ] PR 被 merge
- [ ] 出現在 MCP Registry 列表

### Claude Code 整合
- [ ] 可透過設定檔加入 agent-ide
- [ ] `claude mcp add agent-ide ...` 正常執行
- [ ] Claude Code 可列出所有工具
- [ ] 工具可正常執行

---

## 發布公告

### GitHub Release
```bash
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

### 公告內容
- [ ] 在 GitHub Releases 建立 Release
- [ ] 使用 CHANGELOG.md 內容
- [ ] 更新專案文件
- [ ] 通知相關社群

---

## 版本更新流程

下次更新時：
1. 更新版本號：`package.json`, `mcp.json`
2. 更新 CHANGELOG.md
3. 執行此檢查清單
4. `npm publish`
5. 更新 MCP Registry（如有需要）

---

## 注意事項

### npm
- 套件名稱一旦發布不能改變
- 版本號遵循 Semantic Versioning
- 發布後 24 小時內可 unpublish
- 超過 24 小時只能 deprecate

### MCP Registry
- PR 需要維護者審核
- 確保所有測試通過
- 文件要清楚完整
- 工具要能正常執行

### 安全性
- 不要包含敏感資訊
- 檢查 .npmignore 正確排除測試/開發檔案
- 確認 LICENSE 檔案存在

---

**準備發布？開始勾選檢查清單！** ✅
