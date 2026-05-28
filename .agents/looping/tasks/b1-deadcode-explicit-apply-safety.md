---
title: Deadcode explicit apply safety
created: 2026-05-28
priority: high
suggested_order: B1
refined: true
---

# Deadcode explicit apply safety

`deadcode` is destructive when run without `--dry-run`. For an AI-agent-oriented CLI, deletion should require an explicit apply signal so accidental command invocation cannot remove code.

Change `deadcode` so detection/preview is the default path and actual deletion requires an explicit flag such as `--apply`. Preserve output quality for summary/json/diff and make the transition clear in CLI help and skill references.

## User Stories
- As an AI coding agent, I want dead code removal to require explicit apply intent, so that exploratory analysis cannot delete code by mistake.
- As a developer, I want preview output to show exactly what would be removed, so that I can review the changes before applying.
- As a CLI user, I want help text and error messages to make the destructive path unambiguous.

## 驗收條件
- Given a project with dead code, when `agent-ide deadcode --path <project>` runs without `--apply`, then it does not modify files and reports a preview/detection result.
- Given the same project, when `agent-ide deadcode --path <project> --apply` runs, then it removes dead code and cleans imports using the existing changeset/applicator flow.
- Given `--dry-run`, when it is used with or without `--apply`, then the command never writes files and the output is consistent with preview semantics.
- Given JSON output, when no write happens, then the response clearly exposes that the operation was preview-only.
- Given existing E2E fixtures, when the deadcode test suite runs, then destructive and non-destructive paths are both proven.

## Scope
- Do not lower existing safety exclusions such as exported symbols and public members.
- Treat backward compatibility as a documented CLI behavior change, not as a reason to keep unsafe defaults.
- Update plugin skill references and README command guidance as part of the task.

