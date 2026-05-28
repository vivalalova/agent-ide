---
title: Destructive mutation safety test matrix
created: 2026-05-28
priority: medium
suggested_order: T1
blockedBy: [b1-deadcode-explicit-apply-safety, d1-path-semantics-and-move-preview-ux, e1-change-signature-call-site-value-control]
refined: true
unit_count: 3
---

# Destructive mutation safety test matrix

Add a cross-command regression matrix for destructive or broad mutation commands. The goal is to prove safety properties at the CLI boundary, not just isolated helper behavior.

## User Stories
- As a maintainer, I want destructive commands tested through fixture-level E2E cases, so that real file side effects are verified.
- As an AI coding agent, I want preview/apply/no-op/failure behavior to be stable, so that I can trust the CLI before editing a project.
- As a reviewer, I want tests to catch partial-write and rollback regressions.

## 驗收條件
- Given `deadcode`, when preview and apply paths are tested, then tests prove non-write and write behavior separately.
- Given `move`, when file, directory, glob, and member move previews run, then tests verify exact final target paths and import updates.
- Given `change-signature`, when add/reorder/remove/rename/change-type paths run, then tests verify final call-site side effects and syntax/compile validity.
- Given failure injection or invalid input, when mutation commands fail, then tests verify no unintended fixture changes remain.
- Given the test matrix, when `pnpm test:e2e` and targeted unit tests run, then all safety guarantees are covered without relying on manual inspection only.

## Scope
- This is a test-hardening task across 3 mutation surfaces: `deadcode`, `move`, and `change-signature`.
- Do not duplicate every existing E2E case; focus on safety properties missing from current coverage.

