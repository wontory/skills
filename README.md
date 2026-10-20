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
