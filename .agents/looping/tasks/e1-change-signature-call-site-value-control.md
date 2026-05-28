---
title: Change-signature call-site value control
created: 2026-05-28
priority: medium
suggested_order: E1
refined: true
---

# Change-signature call-site value control

`change-signature --add` currently derives call-site values from the declared default. That is useful for simple migrations, but API changes often need a different inserted call-site expression than the function default value.

Add an explicit way to control inserted call-site values while preserving current shorthand for simple cases.

## User Stories
- As an AI coding agent, I want to add a parameter with a function default and a separate call-site value, so that migrations can express real API intent.
- As a TypeScript developer, I want string defaults and expressions to be normalized predictably, so that generated edits compile.
- As a maintainer, I want parser and transformer tests around add-parameter semantics, so that future signature changes do not regress.

## 驗收條件
- Given `--add` uses the current shorthand, when no explicit call-site value is provided, then existing behavior remains compatible.
- Given an explicit call-site value is provided, when call sites are updated, then the inserted expression uses that value instead of the default.
- Given string, boolean, null, undefined, object literal, and identifier expressions, when parameters are added, then generated function signatures and call sites preserve valid TS/JS syntax.
- Given TypeScript and JavaScript fixtures, when E2E tests run, then call-site updates compile or pass syntax checks.
- Given invalid add-parameter syntax, when the command runs, then it fails fast with a clear validation error.

## Scope
- Decide and document the CLI syntax in command help and skill references.
- Avoid overloading syntax in a way that breaks existing `name:type=default@position` behavior.

