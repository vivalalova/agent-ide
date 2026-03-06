---
title: "重構: 清理 Application 層死碼"
created: 2026-03-06
priority: medium
suggested_order: C1
---

# 重構: 清理 Application 層死碼

src/application/ 包含 EventBus、StateManager、SessionManager、ModuleCoordinator、CacheCoordinator、ErrorHandler、ApplicationState 等類別。經搜索確認 interfaces/、core/、infrastructure/ 均無 import 來自 @application。整層疑似為設計階段預留但未接入的 DI 容器。

## User Stories

- As a developer, I want unused application layer code removed, so that the codebase stays lean and maintainable.

## 驗收條件

- Given `agent-ide deadcode` self-check, when scanning the project, then application/ classes are reported as unused
- Given confirmation of dead code, when removing application/ directory, then `pnpm build && pnpm lint && pnpm test` all pass
- Given removal, when checking tsconfig paths, then `@application/*` alias is also removed
