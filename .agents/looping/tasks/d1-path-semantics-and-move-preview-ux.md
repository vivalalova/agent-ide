---
title: Path semantics and move preview UX
created: 2026-05-28
priority: medium
suggested_order: D1
refined: true
---

# Path semantics and move preview UX

Several commands use `--path`, but the meaning varies between project root, file path, and command-specific root resolution. `move` also intentionally follows Unix `mv` behavior, including nesting when the target directory exists, which is correct but easy to misunderstand.

Unify path semantics documentation, error messages, and preview summaries so users and agents can know exactly what source, project root, and final target path will be used before writes happen.

## User Stories
- As an AI coding agent, I want command output to show resolved project root and final target paths, so that I can avoid path mistakes.
- As a CLI user, I want `move --dry-run` to list exact final destinations, so that Unix nesting behavior is visible before apply.
- As a maintainer, I want path validation helpers to be shared, so that commands do not drift in path behavior.

## 驗收條件
- Given a file path passed to a command that resolves project root, when the command runs, then errors and JSON metadata identify the resolved project root and target file where relevant.
- Given `move src/utils src/helpers` where `src/helpers` already exists, when `--dry-run` runs, then output explicitly shows the final nested target path.
- Given glob move with multiple files, when `--dry-run` runs, then output lists moved file count and exact destinations, truncating only with a clear message for large sets.
- Given invalid source/target paths, when commands fail, then error messages distinguish project-root resolution failure from missing source or invalid target.
- Given README and skill references, when docs are reviewed, then `--path` semantics are consistent with command behavior.

## Scope
- Prefer shared path-resolution helpers where commands already duplicate semantics.
- Preserve existing Unix `mv` behavior; improve visibility instead of changing semantics.

