# Agent IDE

**🎯 Minimize tokens, maximize accuracy for AI Agents**

Code intelligence toolkit designed for AI agents, providing search, refactoring, and dependency analysis capabilities.

## 🚀 Quick Start

### CLI Installation

```bash
# From npm
npm install -g agent-ide

# From source
git clone https://github.com/vivalalova/agent-ide.git
cd agent-ide
pnpm install && pnpm build && npm link
```

### Claude Code Skill Installation

```bash
# From marketplace
/plugin marketplace add vivalalova/agent-ide
# Install plugin
/plugin install agent-ide@vivalalova/agent-ide
```

### CLI Commands

| Command            | Description                              | Output Formats      |
| ------------------ | ---------------------------------------- | ------------------- |
| `rename`           | Rename symbols and update references     | json, summary, diff |
| `change-signature` | Modify function signatures               | json, summary, diff |
| `move`             | Move files and update imports            | json, summary, diff |
| `move-member`      | Move members between files               | json, summary, diff |
| `cycles`           | Detect circular dependencies             | json, summary       |
| `impact`           | Analyze file impact range                | json, summary       |
| `snapshot`         | Generate module/project snapshots for AI | json, summary       |

## 📖 Documentation

- [**Command Reference**](./plugins/skills/agent-ide/SKILL.md) - Quick reference for all commands
- [**Detailed Docs**](./plugins/skills/agent-ide/references/) - Usage guides and examples

## 📄 License

MIT License - See [LICENSE](LICENSE)

---

**Empower AI agents to understand and manipulate code smarter** 🤖✨
