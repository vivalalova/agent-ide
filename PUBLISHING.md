# 發布指南

準備工作已完成，可以開始發布 Agent IDE。

## 快速發布

### 發布到 npm

```bash
# 登入 npm
npm login

# 發布
npm publish --access public

# 驗證
npm view agent-ide
```

發布後使用者可以：
```bash
npm install -g agent-ide
```

### 驗證安裝

```bash
# npm 安裝測試
npm install -g agent-ide
agent-ide --version
```

## 已準備的檔案

✅ `.npmignore` - npm 排除清單
✅ `package.json` - 完整發布資訊
✅ `PUBLISH_CHECKLIST.md` - 詳細檢查清單

## 發布後連結

- npm 套件：https://www.npmjs.com/package/agent-ide
- GitHub：https://github.com/vivalalova/agent-ide
- Issues：https://github.com/vivalalova/agent-ide/issues
- Discussions：https://github.com/vivalalova/agent-ide/discussions

## 注意事項

### npm 發布

- 首次發布需要 `--access public`
- 版本號無法重複使用
- 發布後 24 小時內可以 unpublish

## 發布後

### 建立 GitHub Release

```bash
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

然後在 GitHub 上建立 Release。

### 更新版本

下次更新時：
1. 更新版本號：`package.json`
2. 執行檢查清單
3. 發布：`npm publish`

---

**準備好了嗎？開始發布吧！** 🚀

詳細檢查清單請查看 [PUBLISH_CHECKLIST.md](./PUBLISH_CHECKLIST.md)
