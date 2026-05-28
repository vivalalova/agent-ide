---
title: Generated CLI reference contract for skill docs and plugin metadata
created: 2026-05-28
priority: medium
suggested_order: M1
refined: true
---

# Generated CLI reference contract for skill docs and plugin metadata

Skill references and plugin metadata can drift from real CLI help. Create a single source-of-truth workflow that checks or generates command reference text from actual command definitions/help output, including the recently strengthened `SKILL.md` description and `plugin.json` discoverability metadata.

## User Stories
- As a maintainer, I want skill references to stay aligned with real CLI options, so that agents receive correct command guidance.
- As a plugin user, I want plugin metadata to contain trigger-rich wording, so that the skill is discoverable when relevant.
- As a reviewer, I want a cheap validation command that catches stale references before commit.

## 驗收條件
- Given CLI command help changes, when the reference validation runs, then stale skill reference text is detected.
- Given `plugins/skills/agent-ide/SKILL.md` frontmatter changes, when plugin validation runs, then `plugin.json` description drift is detected or explicitly regenerated.
- Given all command reference files, when the generator/checker runs, then options/defaults match real `agent-ide <command> --help` output.
- Given docs-only metadata changes, when validation runs, then no build/test requirement is introduced beyond docs/plugin checks.

## Scope
- Include command references under `plugins/skills/agent-ide/references/`.
- Include `plugins/skills/agent-ide/plugin.json` description alignment.
- Do not invent new CLI behavior ahead of code; docs must follow actual command help.
