---
name: Agent IDE
description: 程式碼智能工具集 - 提供搜尋、重構、移動、依賴分析等功能，專為 AI 代理設計的程式碼操作工具
tags: [code-analysis, refactoring, code-quality, development-tools]
version: 0.2.0
author: Agent IDE Team
repository: https://github.com/vivalalova/agent-ide
---

# Agent IDE Skill

這個 skill 幫助你使用 agent-ide 工具集來分析和重構程式碼。Agent IDE 提供了一系列命令列工具，專為 AI 代理設計，用於高效的程式碼操作。

## 何時使用此 Skill

當用戶要求以下任務時，請使用此 skill：

- 分析程式碼品質或複雜度
- 檢測死代碼或未使用的符號
- 重命名變數、函數或類別
- 移動檔案或程式碼片段
- 分析依賴關係或檢測循環依賴
- 搜尋程式碼符號或文字
- 評估程式碼的 "垃圾度"（ShitScore）

## 可用工具

### 1. 程式碼搜尋 (search)

```bash
# 搜尋符號或文字
agent-ide search "UserService" --format json

# 正規表達式搜尋
agent-ide search "function.*User" --type regex --format json
```

**輸出格式**：JSON，包含符號位置、類型、引用等資訊

### 2. 符號重命名 (rename)

```bash
# 重命名符號並更新所有引用
agent-ide rename --from oldName --to newName --format json

# 預覽變更（不實際修改）
agent-ide rename --from oldName --to newName --preview --format json
```

**注意**：
- 會自動更新所有引用該符號的位置
- 建議先使用 --preview 查看影響範圍

### 3. 檔案移動 (move)

```bash
# 移動檔案並自動更新所有 import
agent-ide move src/old.ts src/new.ts --format json

# 預覽影響範圍
agent-ide move src/old.ts src/new.ts --preview --format json
```

**功能**：
- 自動更新所有引用該檔案的 import 語句
- 支援相對路徑和絕對路徑

### 4. 行移動 (shift)

```bash
# 單檔案內移動（第 2-5 行移到第 10 行之前）
agent-ide shift src/file.ts --from 2 --to 5 --position 10 --format json

# 跨檔案移動
agent-ide shift src/old.ts --from 1 --to 3 --target src/new.ts --position 1 --format json

# 移動到新檔案（自動生成檔名）
agent-ide shift src/file.ts --from 1 --to 5 --target src/newfile --position 1 --format json

# 預覽模式
agent-ide shift src/file.ts --from 1 --to 5 --position 10 --preview --format json
```

**用途**：
- 單檔案內移動程式碼行
- 跨檔案移動程式碼片段
- 提取程式碼到新檔案

### 5. 程式碼分析 (analyze)

```bash
# 複雜度分析
agent-ide analyze complexity --path ./src --format json

# 死代碼檢測
agent-ide analyze dead-code --path ./src --format json

# 顯示所有結果（包含無問題項目，使用 --all 參數）
agent-ide analyze complexity --path ./src --format json --all
```

**輸出結構**：
```json
{
  "summary": { /* 統計資訊 */ },
  "issues": [ /* 只有問題項目（預設） */ ],
  "all": [ /* 完整結果（僅 --all 時存在） */ ]
}
```

### 6. 依賴關係分析 (deps)

```bash
# 分析依賴關係（預設只顯示問題，如循環依賴）
agent-ide deps --path ./src --format json

# 顯示完整依賴圖
agent-ide deps --path ./src --format json --all
```

**功能**：
- 檢測循環依賴
- 分析模組依賴關係
- 計算依賴深度

### 7. 垃圾度評分 (shit)

```bash
# 基本評分（0-100，越高越糟）
agent-ide shit --path ./src --format json

# 詳細分析（包含各維度分數和修復建議）
agent-ide shit --path ./src --detailed --format json

# CI/CD 門檻檢查
agent-ide shit --path ./src --max-allowed=70
```

**評分維度**：
- Complexity（30%）：循環複雜度、巢狀深度
- Maintainability（30%）：程式碼重複、函數長度
- Architecture（30%）：依賴關係、模組化程度
- QualityAssurance（20%）：型別安全、測試覆蓋率、錯誤處理、命名規範、安全性

**輸出範例**：
```json
{
  "shitScore": 45,
  "breakdown": {
    "complexity": 40,
    "maintainability": 50,
    "architecture": 35,
    "qualityAssurance": 60
  },
  "suggestions": [
    "減少函數複雜度",
    "增加測試覆蓋率"
  ]
}
```

## 使用建議

### 工作流程範例

**重構前的準備**：
1. 使用 `shit` 命令評估程式碼品質基線
2. 使用 `analyze complexity` 找出高複雜度函數
3. 使用 `deps` 檢查依賴關係

**執行重構**：
1. 使用 `shift` 提取複雜函數到獨立檔案
2. 使用 `rename` 改善命名
3. 使用 `move` 重組檔案結構

**驗證重構結果**：
1. 再次運行 `shit` 確認分數改善
2. 使用 `analyze` 確認複雜度降低
3. 使用 `deps` 確認沒有引入循環依賴

### 參數說明

- `--format json`：建議總是使用 JSON 格式輸出，方便解析
- `--preview`：在實際修改前預覽變更
- `--all`：顯示完整結果（預設只顯示問題項目）
- `--detailed`：顯示詳細分析（用於 shit 命令）
- `--path`：指定分析路徑（預設為當前目錄）

### 注意事項

1. **總是使用 --format json**：這樣可以結構化地解析輸出
2. **重構前先預覽**：使用 --preview 參數避免意外修改
3. **理解輸出結構**：
   - 預設輸出只包含 `summary` 和 `issues`
   - 使用 `--all` 參數才會包含 `all` 欄位
4. **支援的語言**：TypeScript、JavaScript、Swift

## 安裝

如果專案中尚未安裝 agent-ide：

```bash
# 全域安裝
npm install -g agent-ide

# 或使用 npx（無需安裝）
npx agent-ide [command]
```

## 更多資訊

- [完整文件](https://github.com/vivalalova/agent-ide)
- [API 參考](https://github.com/vivalalova/agent-ide/blob/main/API.md)
- [實戰指南](https://github.com/vivalalova/agent-ide/blob/main/docs/GUIDE.md)
- [問題回報](https://github.com/vivalalova/agent-ide/issues)

## 範例對話

**用戶**：幫我分析這個專案的程式碼品質

**你的回應**：
我會使用 agent-ide 來分析程式碼品質。首先讓我運行垃圾度評分：

```bash
agent-ide shit --path ./src --detailed --format json
```

然後我會分析複雜度：

```bash
agent-ide analyze complexity --path ./src --format json
```

（然後根據輸出提供具體建議）

---

**用戶**：幫我把 UserService 重命名為 UserManager

**你的回應**：
我會使用 agent-ide 的 rename 功能。首先讓我預覽變更：

```bash
agent-ide rename --from UserService --to UserManager --preview --format json
```

（確認無誤後）現在執行重命名：

```bash
agent-ide rename --from UserService --to UserManager --format json
```

## 技巧

1. **組合使用多個工具**：先用 `search` 找到符號位置，再用 `rename` 或 `shift` 進行操作
2. **CI/CD 整合**：使用 `shit --max-allowed` 設定品質門檻
3. **增量重構**：使用 `analyze` 找出高優先級的重構目標，逐步改善
4. **依賴管理**：定期運行 `deps` 檢查，避免循環依賴累積

## 支援

如果遇到問題或需要新功能，請到 [GitHub Issues](https://github.com/vivalalova/agent-ide/issues) 回報。
