---
name: agent-ide
description: |
  TS/JS 程式碼智能重構工具。執行以下操作時自動選用：
  - 重命名符號 → /rename（取代逐一 Edit）
  - 移動/重組檔案 → /move（取代 Write+Delete）
  - 理解專案架構 → /snapshot（取代逐檔 Read）
  - 清理未使用程式碼 → /deadcode
  - 修改函式參數 → /change-signature
  - 檢測循環依賴 → /cycles
  - 分析變更影響 → /impact
  - 查找符號引用 → /find-references
  - 追蹤呼叫層次 → /call-hierarchy
  優勢：自動更新所有引用、一次完成、零遺漏
---

# Agent IDE

TS/JS 程式碼智能重構工具，透過 slash commands 操作。

## 可用命令

| 命令 | 用途 |
|------|------|
| `/snapshot` | 專案/模組 API 快照（節省 ~91% token） |
| `/cycles` | 循環依賴檢測 |
| `/impact` | 變更影響分析 |
| `/find-references` | 符號引用查找 |
| `/call-hierarchy` | 呼叫層次追蹤 |
| `/rename` | 重命名符號 + 自動更新引用 |
| `/move` | 移動檔案/成員 + 自動更新 import |
| `/change-signature` | 修改函式參數 + 更新呼叫點 |
| `/deadcode` | 檢測/清理未使用程式碼 |

## 最佳實踐

1. 開始任務前用 `/snapshot` 了解專案結構
2. 變更類命令先加 `--dry-run` 預覽
3. 重構後用 `/cycles` 檢查循環依賴
