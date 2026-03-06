---
title: "測試: move-member 獨立 E2E 測試"
created: 2026-03-06
priority: high
suggested_order: B2
---

# 測試: move-member 獨立 E2E 測試

move-member 是獨立 core 模組（src/core/move-member/），但沒有自己的 E2E 測試檔案。所有測試散落在 cli-move-position.e2e.test.ts 中，edge case 不足。

需新建 cli-move-member.e2e.test.ts 專注測試成員移動的 edge case。

## User Stories

- As a developer, I want dedicated move-member E2E tests covering edge cases, so that member movement refactoring is robust.

## 驗收條件

- Given a new `cli-move-member.e2e.test.ts`, when running E2E tests, then all tests pass
- Given cross-file member dependencies, when moving a member that depends on siblings, then imports are correctly updated
- Given a member with JSDoc, when moving to another file, then JSDoc is preserved
- Given a name conflict at target, when moving, then an appropriate error is reported
