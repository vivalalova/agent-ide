---
title: Symbol query disambiguation for references and call hierarchy
created: 2026-05-28
priority: high
suggested_order: A1
refined: true
---

# Symbol query disambiguation for references and call hierarchy

`find-references` and `call-hierarchy` currently accept a symbol/function name but do not expose the same `--at <file:line:column>` disambiguation surface that `rename` already has. This creates ambiguity in large TS/JS projects with repeated names, overloaded helpers, class methods, and local functions.

Implement a shared symbol target resolution path for read-only symbol queries so callers can target a specific definition by location and receive stable identity data in the output.

## User Stories
- As an AI coding agent, I want `find-references --at` to target one symbol definition, so that I do not merge unrelated same-name references.
- As an AI coding agent, I want `call-hierarchy --at` to target one function or method definition, so that incoming/outgoing calls are not polluted by unrelated functions.
- As a CLI integrator, I want JSON output to include enough symbol identity to correlate definitions and references across calls.

## 驗收條件
- Given multiple same-name functions in different files, when `agent-ide find-references <name> --at <file:line:column> --format json` runs, then references only belong to the selected definition.
- Given multiple same-name class methods, when `agent-ide call-hierarchy <name> --at <file:line:column> --format json` runs, then the call hierarchy uses the selected method definition.
- Given an invalid `--at` location, when either command runs, then the CLI exits non-zero with a clear error naming the unresolved symbol and location.
- Given no `--at`, when multiple definitions exist, then JSON output exposes all definition candidates and summary data without silently pretending a single target was selected.
- Given TypeScript and JavaScript fixtures, when targeted E2E tests run, then both languages prove the same disambiguation behavior.

## Scope
- Reuse or extract the existing `rename` location parsing and symbol filtering behavior instead of duplicating incompatible logic.
- Add symbol identity fields to read-only JSON results where they help downstream agents distinguish same-name symbols.
- Keep existing no-`--at` behavior backward compatible unless ambiguity currently causes incorrect output; if behavior changes, document the JSON contract change.

