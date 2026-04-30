---
name: agent-ide-cli-fixture-test
description: Manual verification workflow for the agent-ide CLI against tests/fixtures. Use when asked to manually test CLI behavior, repeatedly mutate fixture projects, inspect git diff, restore fixtures between cases, cover multiple TS/JS cases, and fix any bug found during fixture-based CLI testing.
---

# Agent IDE CLI Fixture Test

Use this skill to manually exercise the built `agent-ide` CLI on fixture projects and turn any failure into a tested fix.

## Workflow

1. Inspect current state:
   - Run `git status --short`.
   - Confirm `tests/fixtures` has no leftover edits before starting.
   - If prior work changed source/tests, keep those changes; only clean fixture mutations created by the current case.

2. Build the CLI before manual tests:
   - Run `pnpm build`.
   - Use `node bin/agent-ide.js ...` for every manual CLI case.

3. For each case, run one CLI action against one fixture, then inspect exactly what changed:
   - Prefer mutation commands: `rename`, `change-signature`, `move`, `deadcode`.
   - Include read-only sanity cases: `find-references`, `impact`, `cycles`, `search`, and `call-hierarchy`.
   - Use fixtures under `tests/fixtures/*`; do not create unrelated throwaway projects.
   - Run `git diff -- tests/fixtures/<fixture>` immediately after each mutation.
   - Verify the final side effect, not only command success.

4. Validate the mutated fixture:
   - TypeScript fixture: run `npx tsc --noEmit -p tests/fixtures/<fixture>/tsconfig.json` when it has a `tsconfig.json`.
   - JavaScript fixture: run `node --check` on changed files and execute a fixture entrypoint when available.
   - If the command is read-only, verify `git status --short -- tests/fixtures` stays clean.

5. Restore before the next case:
   - Run `git restore tests/fixtures/<fixture>`.
   - Remove new files/directories from the case with scoped `git clean -fd tests/fixtures/<fixture>/<path>`.
   - Confirm `git status --short -- tests/fixtures` is clean.
   - Treat "reset fixture" as scoped restore/clean; do not use `git reset --hard`.

6. If a bug appears:
   - Keep the failing behavior concrete: command, fixture, diff, and compile/runtime error.
   - Add or update an E2E/integration test that fails for the bug.
   - Run the targeted test and confirm it is red.
   - Fix production code, not the fixture output.
   - Run the targeted test green, rebuild, then repeat the same manual CLI case.
   - Restore the fixture after retest.

7. Finish with validation:
   - Run `pnpm test`.
   - Run `pnpm test:cli`.
   - Run `pnpm test:full` when behavior changed or multiple CLI paths were touched.
   - Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm validate:plugin`, and `git diff --check`.
   - Report any command that was not run.

## Case Coverage

Cover a mix of these cases when the user asks for "多測幾種 case":

- TS `rename --at` on a local symbol; expect only the selected scope to change.
- TS `change-signature --rename`, `--add`, `--remove`, and `--reorder`; expect body references and call sites to remain valid.
- TS `move` for a file, a member (`src/file.ts:line`), and a glob; expect imports and compilation to stay valid.
- JS `rename --at`; expect 1-based locations and correct import/call-site updates.
- JS `move`; expect ESM imports to keep required runtime extensions such as `.js`.
- JS/TS `deadcode`; expect deleted code to match unused symbols and changed files to parse/compile.
- Read-only commands; expect useful output and zero fixture diff.

## Reporting

Report:

- Which fixture CLI cases were manually run.
- Which diffs were expected and verified.
- Which bugs were found and fixed.
- Which automated validation commands passed.
- Whether `tests/fixtures` is clean at the end.
