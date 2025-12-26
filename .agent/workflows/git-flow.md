---
name: git-manager
description: Git 版本控制專家 - 當用戶提到 commit/push/pull/branch/checkout/merge/rebase/tag/stash/reset/cherry-pick 等任何 Git 操作詞彙時，必須立即使用此 skill，禁止直接用 Bash 執行 git 指令。負責 commit 訊息品質、分支管理、安全檢查和版本控制最佳實踐 (project, gitignored)
---

# Git 版本控制專家

協助進行 Git 版本控制操作，確保符合規範且安全。

## 🚨 核心原則

### ✅ Commit 前必須確認

1. [ ] 使用者明確要求
2. [ ] lint/typecheck 錯誤已修正
3. [ ] 功能已測試且正常
4. [ ] 無敏感資訊（密碼、金鑰、token）
5. [ ] .gitignore 已配置

### 🚨 Commit 過程中禁止

- **禁止** `git restore`、`git checkout -- file` 等還原程式碼的操作
- **禁止** `git reset --hard` 丟棄變更
- **禁止** 刪除或修改不屬於本次 commit 範圍的程式碼
- Commit 流程只做：`git status` → `git diff` → `git add` → `git commit`
- 若需排除某檔案，用 `git add` 指定檔案，**不要用 restore 還原**

### 📦 「Commit All」的正確理解

- 使用者說「commit all」是指**要 commit 所有的 diff**
- **執行時仍要分階段 commit**，不是全部合成一個 commit
- 按照功能/類型分類，建立多個有意義的 commit
- 遵循「系列 Commit」格式，確保每個 commit 職責單一

## Commit 訊息規範

### Conventional Commits 格式

```
<type>: <description>

[optional body]
```

### Type 類型

- `feat`: 新功能
- `fix`: Bug 修復
- `docs`: 文檔更新
- `style`: 程式碼格式
- `refactor`: 重構
- `perf`: 效能優化
- `test`: 測試相關
- `chore`: 建置流程或輔助工具
- `ci`: CI/CD 相關

### 系列 Commit

**用途**：同一主題的多個單一職責 commit

**格式**：`<type>: [系列主題] <具體內容>`

**⚠️ 重要**：系列 Commit **不使用 scope**，避免與標準 Conventional Commits 格式混淆

```bash
# ✅ 正確：使用系列主題方括號
git commit -m "docs: [移除 CustomType 功能] 更新 claude.md"
git commit -m "refactor: [移除 CustomType 功能] 移除相關程式碼"
git commit -m "chore: [移除 CustomType 功能] 重置 migration 檔案"
git commit -m "test: [移除 CustomType 功能] 更新測試案例"

# ❌ 錯誤：不要使用 scope 加方括號
git commit -m "docs(upload): [移除 CustomType 功能] 更新 claude.md"
git commit -m "refactor(upload): [移除 CustomType 功能] 移除相關程式碼"
```

**優勢**：
- ✅ 每個 commit 可獨立理解和回溯
- ✅ 問題精確定位
- ✅ Code review 更容易
- ✅ 符合小步快速實踐

### 分類 Commit（無特定主題）

**用途**：零散變更、沒有明確功能主題的 commit

**格式**：`<type>: [分類] <具體內容>`

```bash
# ✅ 分類範例
git commit -m "refactor: [程式碼風格] 統一縮排格式"
git commit -m "fix: [Lint 修正] 修正 ESLint 警告"
git commit -m "chore: [依賴更新] 升級 lodash 版本"
git commit -m "docs: [註解補充] 新增函數說明"
git commit -m "style: [格式調整] 移除多餘空行"
```

**常用分類**（包括但不限於）：
- `[程式碼風格]` - 格式、命名、排版調整
- `[Lint 修正]` - 修正 linter 警告/錯誤
- `[依賴更新]` - 套件升級、依賴調整
- `[註解補充]` - 新增或修正程式碼註解
- `[格式調整]` - 空行、縮排等格式化
- `[型別修正]` - TypeScript 型別調整
- `[清理]` - 移除無用程式碼、檔案

### GitHub Issue Commit

**用途**：修復 GitHub Issue，以 Issue 為單位 commit

**格式**：`fix: [Fixed #XX] <描述>`

```bash
# ✅ 正確
fix: [Fixed #42] 修正登入頁面的 XSS 漏洞

# ❌ 錯誤
fix: 修正 #42 的問題      # 缺少 [Fixed #XX]
fix: [#42] 修正登入問題   # 缺少 Fixed
```

### 最佳實踐

- 主體使用繁體中文
- 簡潔明瞭（1-2 句話）
- 祈使句（如「新增」而非「新增了」）
- 描述「做了什麼」而非「為什麼做」

```bash
# ✅ 良好範例
feat: 新增使用者認證功能
fix: 修正登入頁面的記憶體洩漏問題
refactor: 重構資料庫連接邏輯以提升可維護性

# ❌ 不良範例
update code
fix bug
WIP
```

## 標準 Commit 流程

```bash
# 1. 檢查狀態和變更
git status
git diff
git diff --name-only

# 2. 敏感資訊檢查
git status | grep -E "\\.env|\\.pem|\\.key|credentials|secret"
git diff | grep -iE "(password|secret|api_key|private_key|token).*=.*['\"]"

# 3. 暫存變更
git add .                    # 暫存所有
git add path/to/file         # 暫存特定檔案

# 4. 執行 Commit
git commit -m "feat: 新增使用者管理功能"

# 系列 commit
git commit -m "docs: [重構認證模組] 更新 API 文檔"

# 5. 查看歷史
git log --oneline -5
```

## 分支管理

### 建立與切換分支

```bash
# 建立並切換
git checkout -b feature/new-feature
git switch -c feature/new-feature  # 新語法

# 切換分支
git checkout main
git switch main
```

### 分支命名規範

- `feature/` - 新功能
- `fix/` - Bug 修復
- `refactor/` - 重構
- `docs/` - 文檔更新
- `test/` - 測試相關

```
feature/user-authentication
fix/login-memory-leak
refactor/database-connection
```

### 合併分支

```bash
git checkout main
git merge feature/new-feature
git branch -d feature/new-feature  # 刪除已合併分支
```

## 常用操作

### 撤銷操作

```bash
# 撤銷未暫存變更
git restore path/to/file
git checkout -- path/to/file

# 取消暫存
git restore --staged path/to/file
git reset HEAD path/to/file

# 修改最後一次 commit（⚠️ 只在未 push 時使用）
git commit --amend -m "新的 commit 訊息"
git add forgotten-file && git commit --amend --no-edit
```

### 重整多個 Commit

**用途**：重組 commit 歷史（合併、拆分、重新分類皆可）

**⚠️ 重要原則**：
- 此操作僅重整 commit 歷史，**絕對不改動程式碼**
- 禁止使用任何會改動程式碼的 git 指令（如 `git checkout -- file`、`git restore`）
- 重新 commit 時遵循本文件的 commit 規範

```bash
# 1. 確認目前狀態（應該是乾淨的）
git status
git log --oneline -10

# 2. reset --soft 到想要的位置
git reset --soft HEAD~3        # 回退 3 個 commit
git reset --soft <commit-hash> # 回退到指定 commit

# 3. stash 備份（保留安全網）
git stash --include-untracked
git stash apply                # apply 但不移除 stash

# 4. 取消暫存，依功能/類型重新分組 commit
git reset HEAD
git add path/to/feature-a/
git commit -m "feat: 功能 A"
git add path/to/refactor/
git commit -m "refactor: 重構 X 模組"
git add path/to/docs/
git commit -m "docs: 更新文檔"
# ...依需求繼續
```

**⚠️ 只在未 push 的 commit 上使用**

### 遠端操作

```bash
git push origin branch-name          # 推送
git push -u origin branch-name       # 首次推送設定上游
git pull origin branch-name          # 拉取
git fetch origin                     # 取得更新（不合併）
```

## 安全性檢查

### .gitignore 必備項目

```gitignore
# 依賴套件
node_modules/
vendor/

# 建置產物
dist/
build/
*.log

# 環境變數
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp

# 作業系統
.DS_Store
Thumbs.db

# 敏感資訊
*.pem
*.key
credentials*.json
```

### 敏感資訊檢查

```bash
# 檢查是否有敏感檔案被追蹤
git ls-files | grep -E "\\.env|\\.pem|\\.key|credentials|secret"

# 檢查 diff 中的敏感內容
git diff | grep -iE "(password|secret|api_key|private_key|token).*="
```

## 工作流程範例

### 功能開發流程

```bash
# 1. 確認主分支最新
git checkout main && git pull origin main

# 2. 建立功能分支
git checkout -b feature/user-auth

# 3. 開發（多次 commit）
git add . && git commit -m "feat: [使用者認證] 新增登入 API"
git add . && git commit -m "feat: [使用者認證] 新增登出功能"
git add . && git commit -m "test: [使用者認證] 新增認證測試"

# 4. 推送
git push -u origin feature/user-auth

# 5. 建立 PR/MR

# 6. 合併後清理
git checkout main && git pull origin main
git branch -d feature/user-auth
```

## ❌ 絕對禁止

- `git push --force` 到 main/master
- `git reset --hard` 在公開分支
- `git commit --no-verify` 跳過 hooks
- Commit 敏感資訊
- Commit 大型二進位檔案（使用 Git LFS）
- 修改已推送的 commit 歷史（除非團隊同意）

## 快速參考

```bash
# 狀態檢查
git status
git diff
git log --oneline -5

# 基本操作
git add .
git commit -m "type: description"
git push origin branch-name

# 撤銷
git restore file              # 撤銷未暫存變更
git restore --staged file     # 取消暫存
git reset --soft HEAD^        # 撤銷 commit（保留變更）
```
