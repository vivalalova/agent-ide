# Agent IDE

**Minimize tokens, maximize accuracy for AI Agents**

Code intelligence toolkit designed for AI agents, providing search, refactoring, and dependency analysis capabilities.

## Features

- **Parser**: TypeScript / JavaScript
- **Unicode identifiers**: Supports non-ASCII variable names
- **Glob patterns**: `move` supports `*.ts`, `**/*.ts`, etc.
- **Output formats**: `--format json | summary | diff`

## Quick Start

### CLI Installation

```bash
npm install -g agent-ide
```

From source:

```bash
git clone https://github.com/vivalalova/agent-ide.git
cd agent-ide
pnpm install && pnpm build && npm link
```

### Claude Code Plugin Installation

```bash
/plugin marketplace add vivalalova/agent-ide
/plugin install agent-ide@vivalalova/agent-ide
```

## Commands

### Query (Read-only)

| Command           | Description                            |
| ----------------- | -------------------------------------- |
| `cycles`          | Detect circular dependencies (Tarjan)  |
| `impact`          | Analyze change impact range (BFS)      |
| `snapshot`        | Generate module API snapshots |
| `find-references` | Find symbol definitions and references |
| `call-hierarchy`  | Analyze function call hierarchy        |
| `deadcode`        | Detect unused code                     |

### Mutation (supports `--dry-run`)

| Command            | Description                                      |
| ------------------ | ------------------------------------------------ |
| `rename`           | Rename symbols and update all references         |
| `change-signature` | Refactor function parameters (reorder/add/remove)|
| `move`             | Move files/directories and update imports        |
| `move` (with line) | Move members across files (`path:line` syntax)   |

## Documentation

- [Command Reference](./plugins/skills/agent-ide/SKILL.md) - Quick reference for all commands

## License

MIT
