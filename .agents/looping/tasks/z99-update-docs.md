---
title: 更新文件
created: 2026-05-28
priority: low
suggested_order: Z99
blockedBy: [a1-symbol-query-disambiguation, b1-deadcode-explicit-apply-safety, d1-path-semantics-and-move-preview-ux, e1-change-signature-call-site-value-control, m1-generated-cli-reference-contract, t1-destructive-mutation-safety-test-matrix]
refined: true
requires_runtime_proof: false
---

# 更新文件

After the selected modification tasks land, update user-facing and agent-facing documentation so README, AGENTS.md, plugin metadata, skill references, and examples match actual behavior.

## User Stories
- As a CLI user, I want README examples to match real command behavior, so that I can run commands without checking source code.
- As an AI coding agent, I want skill references to describe current options and safety rules, so that generated commands are correct.
- As a maintainer, I want documentation updates after behavior changes, so that docs drift does not become a product bug.

## 驗收條件
- Given completed CLI behavior changes, when docs are reviewed, then README command tables and examples match actual `agent-ide --help` output.
- Given skill reference files, when compared to real command help, then defaults/options are aligned.
- Given deadcode safety changes, when docs are reviewed, then destructive apply behavior is explicit.

## Scope
- Update docs only after implementation tasks define the final behavior.
- Do not document behavior that has not landed in code and tests.
