# Agent IDE

**Minimize tokens, maximize accuracy for AI Agents**

Code intelligence toolkit designed for AI agents, providing search, refactoring, and dependency analysis capabilities.

## Features

- **Parser**: TypeScript / JavaScript
- **Unicode identifiers**: Supports non-ASCII variable names
- **Glob patterns**: `move` supports `*.ts`, `**/*.ts`, etc.
- **Output formats**: `--format json | summary | diff`

## Quick Start

### CLI Usage

```bash
npx agent-ide <command> [options]
```

Global options:

- `--no-cache` - disable index cache
- `--cache-dir <path>` - override index cache directory
- `--verbose` - show detailed processing information

From source:

```bash
git clone https://github.com/vivalalova/agent-ide.git
cd agent-ide
pnpm install && pnpm build && npm link
```

### Claude Code Plugin Installation

In Claude Code conversation:

```text
/plugin marketplace add vivalalova/agent-ide
/plugin install agent-ide@agent-ide-skills
```

Or from terminal:

```bash
claude plugin marketplace add vivalalova/agent-ide
claude plugin install agent-ide@agent-ide-skills
```

### Recommended: Add to CLAUDE.md

To help Claude Code automatically use agent-ide when appropriate, add the following to your `~/.claude/CLAUDE.md`:

```markdown
## Agent IDE Integration

Use the `agent-ide` skill for TS/JS code intelligence operations. **Prefer agent-ide over manual Edit/Grep** for:

| Operation | Command | Instead of |
|-----------|---------|------------|
| Rename symbol | `/agent-ide rename` | Multiple Edit calls |
| Move file/member | `/agent-ide move` | Write + Delete + Edit imports |
| Search symbol | `/agent-ide search` | Grep + manual ranking |
| Find references | `/agent-ide find-references` | Grep + manual filtering |
| Detect dead code | `/agent-ide deadcode` | Manual analysis |
| Remove dead code | `/agent-ide deadcode --apply` | Manual deletion |
| Analyze impact | `/agent-ide impact` | Manual tracing |
| Check cycles | `/agent-ide cycles` | Manual dependency review |
| Function refactor | `/agent-ide change-signature` | Multiple Edit calls |

**Trigger keywords**: rename, move file, move function, search symbol, find references, dead code, unused code, circular dependency, call hierarchy, refactor parameters, impact analysis

**Benefits**: Automatic reference updates, atomic operations, previewable changes, undo-friendly diffs
```

## Commands

### Query (Read-only)

| Command           | Description                            |
| ----------------- | -------------------------------------- |
| `cycles`          | Detect circular dependencies (Tarjan)  |
| `impact`          | Analyze change impact range (BFS)      |
| `search`          | Search symbols with fuzzy matching     |
| `find-references` | Find symbol definitions and references; use `--at` to disambiguate same-name symbols |
| `call-hierarchy`  | Analyze function call hierarchy; use `--at` to target one same-name function or method |
| `deadcode`        | Detect unused code and preview removals; use `--apply` to remove |

### Mutation (supports `--dry-run`)

| Command            | Description                                      |
| ------------------ | ------------------------------------------------ |
| `rename`           | Rename symbols and update all references         |
| `change-signature` | Add, remove, reorder, rename, or retype function parameters; supports distinct call-site values for added params |
| `move`             | Move files/directories and update imports        |
| `move` (with line) | Move members across files (`path:line` syntax)   |
| `deadcode --apply` | Remove unused code and clean imports             |

`deadcode` is preview-only unless `--apply` is present. `--dry-run` wins even when passed with `--apply`.

`move --path` is the project root for relative source/target paths. `move --dry-run` reports resolved project root, requested source/target, final target paths, and import-update hunks; glob JSON also lists `movedFiles`. Targets follow Unix `mv` nesting when the target directory already exists.

`change-signature` supports `--add`, `--remove`, `--reorder`, `--rename`, and `--change-type`. Use `--call-site-value param=expression` with `--add` when existing call sites should receive a value different from the function default.

`impact --path` is the project root for relative `--file` paths. JSON validation errors include `pathContext` with resolved project root and target file metadata.

## Documentation

- [Command Reference](./plugins/skills/agent-ide/SKILL.md) - Quick reference for all commands

## License

MIT
