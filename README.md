# skills

Agent skills for Claude Code, Codex, and friends, plus `@wontory/skills`: a CLI that installs skills from several sources (this repo, [obra/superpowers](https://github.com/obra/superpowers), and paid providers) in one pass.

## Install skills

```bash
npx @wontory/skills
```

In a terminal this opens a tree picker right away, filling in each source as it loads, with a recommended set already ticked. Adjust it, paste a paid provider's token inline if you have one, then choose where to install and which agents get the skills. Your last two answers are remembered as defaults, and a short "Next steps" note at the end says where the skills went and how to use them.

| Key                | Action                                                                |
| ------------------ | --------------------------------------------------------------------- |
| `↑`/`↓` or `j`/`k` | Move                                                                  |
| `space`            | Select a skill, or every skill in a source                            |
| `←`/`→` or `h`/`l` | Collapse / expand a source                                            |
| `a`                | Select everything (again to clear)                                    |
| `/`                | Filter by name or description. Backspace on an empty filter clears it |
| `enter`            | Confirm (or submit the token you typed)                               |
| `esc` / `ctrl+c`   | Cancel                                                                |

### Non-interactive use

```bash
# everything free, all detected agents, into the current project
npx @wontory/skills -y

# only some skills; `source@name` disambiguates, `source@*` takes a whole source
npx @wontory/skills -s commit,pr -s obra/superpowers@brainstorming -a claude-code -g

# limit sources, or add a GitHub repo that is not in the catalog
npx @wontory/skills --source wontory/skills --source vercel-labs/agent-skills -y

# see what would run (tokens are masked)
npx @wontory/skills -y --dry-run
```

Paid providers take a token from `--<id>-token <token>`, the `<ID>_TOKEN` environment variable, or the saved user config (`--save-tokens`, or answer yes when asked after typing one). Currently: `--animationsdev-token` / `ANIMATIONSDEV_TOKEN` and `--aiforui-token` / `AIFORUI_TOKEN`.

### Team manifest

Pass `--save` (or answer yes after picking) to write `wontory-skills.json` next to your code:

```json
{
  "scope": "project",
  "agents": ["claude-code"],
  "skills": {
    "wontory/skills": ["commit", "pr"],
    "obra/superpowers": ["*"]
  }
}
```

With that file present, `npx @wontory/skills` installs exactly that set without asking and reports which skills were new and which were refreshed to the latest version. `npx @wontory/skills update` reinstalls it with a fresh catalog, and `-i` reopens the picker with the manifest preselected. Flags still win over the manifest.

### Other commands

| Command                                  | Description                                      |
| ---------------------------------------- | ------------------------------------------------ |
| `npx @wontory/skills list [--json]`      | Every skill the sources offer, with descriptions |
| `npx @wontory/skills installed`          | Installed skills (`npx skills list`)             |
| `npx @wontory/skills remove [skills...]` | Remove skills (`npx skills remove`)              |

### Options

| Option                     | Description                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `-g, --global`             | Install globally (user-level)                                                                                                                    |
| `--project`                | Install into the current project, even when the manifest says `global`                                                                           |
| `-a, --agent <agents>`     | Target agents, comma-separated or repeated. `*` means all detected. Any id the [`skills` CLI](https://github.com/vercel-labs/skills) knows works |
| `-s, --skill <skills>`     | Only these skills (`name` or `source@name`, `source@*`)                                                                                          |
| `--source <sources>`       | Only these sources (name, `owner/repo`, or paid id)                                                                                              |
| `-y, --yes`                | Never prompt                                                                                                                                     |
| `-i, --interactive`        | Open the picker even when a manifest exists                                                                                                      |
| `--skip-paid`              | Ignore paid sources                                                                                                                              |
| `--dry-run`                | Print the commands without running them                                                                                                          |
| `--save` / `--save-tokens` | Persist the selection / tokens without asking                                                                                                    |
| `--refresh`                | Ignore the one-hour discovery cache                                                                                                              |
| `--no-remote`              | Use the bundled source catalog instead of fetching the live one                                                                                  |

Set `GITHUB_TOKEN` (or `GH_TOKEN`) to raise the GitHub API rate limit when discovering free skills. Discovery results are cached for an hour under `$XDG_CACHE_HOME/wontory-skills`, `%LOCALAPPDATA%\wontory-skills\cache`, or `~/.cache/wontory-skills`.

Requires Node 20.19 or newer.

### Sources

The catalog lives in [`sources.json`](./sources.json). The CLI fetches the latest copy at startup and falls back to the bundled one offline, so a source can be added with a pull request and no release. You can also add your own in `~/.config/wontory-skills/config.json` (or `$XDG_CONFIG_HOME/wontory-skills/config.json`):

```json
{
  "tokens": { "animationsdev": "..." },
  "sources": {
    "free": [{ "name": "my-team", "repo": "my-org/skills" }],
    "paid": [
      {
        "id": "acme",
        "name": "acme.dev",
        "installer": "@acme/install",
        "endpoint": "https://acme.dev/api/install"
      }
    ]
  }
}
```

A paid source's `id` derives its flag (`--acme-token`) and env var (`ACME_TOKEN`); `tokenUrl` tells users where to get one. A free source may list `recommended` skill ids (or `true` for all) to be preselected for first-time users.

## Development

```bash
bun install
bun run typecheck
bun run lint
bun run fmt:check
bun run build
```

Create a skill from the template (`packages/generator/templates/skill.hbs`):

```bash
bun run generate:skill
# or, skipping prompts:
bun run generate:skill -- <name> "Use when ..." "<summary>"
```

This writes `skills/<name>/SKILL.md` with the shared structure (summary, `Steps`, `Never`). Replace the `<...>` hints and add topic sections between `Steps` and `Never`.

Releases go through [changesets](./.changeset): add one with `bun run changeset`, and the release workflow publishes after it lands on `main`.
