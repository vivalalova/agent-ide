---
title: impact --format json 輸出移除 cycles 相關噪音欄位
created: 2026-05-13
priority: medium
suggested_order: B2
---

# impact --format json 輸出移除 cycles 相關噪音欄位

## 背景

`impact --format json` 結果物件混入 `cycles: []`、`summary.cyclesFound: 0`、`summary.issuesFound: 0` 等與影響分析無關的欄位。看起來是 query result 共用 summary 結構洩漏。

## 重現

```bash
agent-ide impact \
  --file /Users/lova/.../sample-project/src/types/user.ts \
  --path /Users/lova/.../sample-project \
  --format json
```

實際輸出片段：
```json
{
  "command": "impact",
  "success": true,
  "cycles": [],
  "summary": {
    "totalScanned": 37,
    "issuesFound": 0,
    "totalFiles": 37,
    "totalDependencies": 84,
    "cyclesFound": 0
  },
  "impact": { ... }
}
```

`cycles`、`cyclesFound`、`issuesFound` 都不該出現在 impact 輸出。

## 預期

- impact 的 JSON 只含與影響分析相關欄位（`command`、`success`、`impact`、`basePath`、最小化 `summary`）
- summary 內若要保留，僅保留 `totalFiles` / `totalDependencies` / `totalAffected` 等與 impact 直接相關項

## Root Cause 確認

`infrastructure/formatters/query-types.ts` 將 `DependencyResult` 設計成同時涵蓋 `QueryCommand.Cycles` 與 `QueryCommand.Impact`，cycles 欄位被宣告為非選，導致 impact JSON 也帶。其他查詢類結果（`SearchResult`、`FindReferencesResult`、`CallHierarchyResult`、`DeadCodeResult`）直接 extends `QueryResult`，**無此問題**，scope 不需擴大。

## User Stories

- As an AI agent，I want impact JSON 輸出每個欄位都對應該命令的語意，so that 不需 token 過濾無關欄位。

## 驗收條件

- 先補 E2E 測試（fail-first）：`impact --format json` 結果不得包含 `cycles`、`cyclesFound`、`issuesFound` 欄位。
- 補 E2E 測試：`cycles --format json` 結果仍正常包含 `cycles` 欄位（避免拆型過頭破壞另一命令）。
- 將 `DependencyResult` 拆為 `CyclesResult` + `ImpactResult` 兩個型別，並更新 `query-formatter.ts` 對應 case。
- `pnpm test` 全綠。
