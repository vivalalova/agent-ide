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
| Detect dead code | `/agent-ide deadcode --dry-run` | Manual analysis |
| Remove dead code | `/agent-ide deadcode` | Manual deletion |
| Analyze impact | `/agent-ide impact` | Manual tracing |
| Check cycles | `/agent-ide cycles` | Manual dependency review |
| Function refactor | `/agent-ide change-signature` | Multiple Edit calls |
| API snapshot | `/agent-ide snapshot` | Multiple Read calls |

**Trigger keywords**: rename, move file, move function, search symbol, find references, dead code, unused code, circular dependency, call hierarchy, refactor parameters, impact analysis

**Benefits**: Automatic reference updates, atomic operations, zero missed references, undo support
```

## Commands

### Query (Read-only)

| Command           | Description                            |
| ----------------- | -------------------------------------- |
| `cycles`          | Detect circular dependencies (Tarjan)  |
| `impact`          | Analyze change impact range (BFS)      |
| `snapshot`        | Generate module API snapshots |
| `search`          | Search symbols with fuzzy matching     |
| `find-references` | Find symbol definitions and references |
| `call-hierarchy`  | Analyze function call hierarchy        |
| `deadcode --dry-run` | Detect unused code                  |

### Mutation (supports `--dry-run`)

| Command            | Description                                      |
| ------------------ | ------------------------------------------------ |
| `rename`           | Rename symbols and update all references         |
| `change-signature` | Refactor function parameters (reorder/add/remove)|
| `move`             | Move files/directories and update imports        |
| `move` (with line) | Move members across files (`path:line` syntax)   |
| `deadcode`         | Remove unused code and clean imports             |

## Documentation

- [Command Reference](./plugins/skills/agent-ide/SKILL.md) - Quick reference for all commands

## License

MIT
