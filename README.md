# skills

To install dependencies:

```bash
bun install
```

To type check:

```bash
bun check
```

To create a new skill from the template (`packages/generator/templates/skill.hbs`):

```bash
bun run generate:skill
```

It asks for the name, the trigger description, and a one-sentence summary. To skip the prompts, pass them in that order:

```bash
bun run generate:skill -- <name> "Use when ..." "<summary>"
```

This writes `skills/<name>/SKILL.md` with the shared structure (summary, `Steps`, `Never`). Replace the `<...>` hints and add topic sections between `Steps` and `Never`.

## Install skills

Install selected agent skills interactively with an interactive terminal tree:

```bash
npx @wontory/skills
```

### Options

- `-g, --global`: Install skills globally (user-level)
- `-a, --agent <agents>`: Target agents (default: pick interactively, or all with `--yes`)
- `-y, --yes`: Non-interactive mode; installs all free skills, skips paid skills without flags
- `--skip-paid`: Skip paid skill providers entirely
- `--animationsdev-token <token>`: Auth token for animations.dev
- `--aiforui-token <token>`: Auth token for aiforui.dev
