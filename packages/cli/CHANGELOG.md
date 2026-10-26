# @wontory/skills

## 0.7.0

### Minor Changes

- Overhaul the installer CLI:

  - Non-interactive control: `--skill` (or positional names, `source@name`, `source@*`), `--source` (also adds an ad-hoc GitHub `owner/repo`), `--dry-run`, and token resolution from `--<id>-token` flags, `<ID>_TOKEN` env vars, or the saved user config.
  - Project manifest `wontory-skills.json`: write it with `--save` (or when asked after picking), and later runs or teammates install the same set without the picker. `update` reinstalls from it; `-i` reopens the picker with it preselected.
  - `list [--json]` prints every discoverable skill; `installed` and `remove` pass through to the `skills` CLI.
  - Source catalog moved to `sources.json`, fetched live with a bundled fallback and extendable from `~/.config/wontory-skills/config.json`; paid providers derive their flag and env var from an `id`.
  - Discovery downloads `SKILL.md` files in parallel, finds them anywhere in the repo, reads descriptions, caches results for an hour, honours `GITHUB_TOKEN`, and explains rate limits.
  - The picker is rebuilt on `@clack/core`: consistent look, resize-safe redraws, descriptions, `/` filter, `a` select-all, vim keys, and inline token entry; agents are picked from the full list the `skills` CLI supports.
  - No more `process.exit()` after network calls, which aborted with a libuv assertion on Windows.
  - Review fixes: the picker no longer sends filter text as a provider token or drops out of filter mode on the last backspace; cursor stays on the same row across filtering and select-all; unknown flags are rejected instead of ignored; token flags are read verbatim from argv (numeric-looking tokens survive); the live catalog cannot redirect a known paid provider's endpoint; partial discovery results are not cached; the cache lives in the per-user cache dir; `--project` overrides a manifest's global scope; `source@ref` accepts paid ids and repos; Windows runs `npx-cli.js` directly instead of through cmd.exe.
  - Requires Node 20.19 or newer (the prompt library and argument parser already did).
  - First-run experience: a spinner reports each source as it loads and ends with a one-line summary; the picker opens with a recommended set preselected (from `recommended` in `sources.json`) instead of empty; Enter on an empty selection explains the keys once before quitting; locked paid sources show where to get a token (`tokenUrl`) and report how many skills a verified token unlocked; the scope and agent prompts remember your last answers; a "Next steps" note after install says where the skills went and how to use, share, and update them; manifest runs mention `-i`, and `-y` without a manifest warns before installing a large set.
  - Installs from GitHub sources run the `skills` CLI in `--json` mode and are rendered by this CLI, so the installer's own UI no longer interleaves with the picker's. Each source reports "N new, M refreshed" against what `skills list` already knew, failures show the installer's last lines, and the picker opens immediately with sources marked "loading…" and fills in as each one arrives (Enter waits for the last one). Paid installers still get the terminal because they may prompt.
  - Tests were removed at the maintainer's request; CI runs lint, format, typecheck, build, and a Node 20.19 smoke test.
  - Picker glyphs that terminals draw double-width (emoji-presentation ▶/✔/✖, font-fallback ◩) are replaced with narrow ones (▸/▾, ✓/✗, yellow ◼ for partial), the cursor row has an explicit ❯ pointer, and the tree opens collapsed with per-source "n/m" counts instead of fully expanded.

## 0.6.0

### Minor Changes

- Enter paid-source tokens inline in the selection tree and load their skill lists from the provider, preselect all skills after a token is verified, drop the select-all row and free tag, and ask once for the install scope and agents (Claude Code, Codex, or all) for every source

## 0.5.1

### Patch Changes

- Fix unsettled top-level await in terminal selection and Windows subprocess spawn

## 0.5.0

### Minor Changes

- Add interactive terminal tree skill selection and phased authentication workflow

## 0.4.1

### Patch Changes

- [#8](https://github.com/wontory/skills/pull/8) [`081e86b`](https://github.com/wontory/skills/commit/081e86b5b54ddc5182d78de12b89e49113e598dd) Thanks [@wontory](https://github.com/wontory)! - The `commit`, `pr`, `review`, and `self-review` skills now name the common AI tools (Claude, Copilot, Codex, Cursor, Gemini) in their "no attribution" rule, so the rule holds for any agent, not only Claude.

## 0.4.0

### Minor Changes

- [#5](https://github.com/wontory/skills/pull/5) [`0bc4747`](https://github.com/wontory/skills/commit/0bc4747b82d800abd79b07b927e380953d240acc) Thanks [@wontory](https://github.com/wontory)! - Add the `review` skill for reviewing someone else's PR with inline cremoji comments, and the `self-review` skill for explaining your own PR's context to yourself and its reviewers.

### Patch Changes

- [#5](https://github.com/wontory/skills/pull/5) [`0bc4747`](https://github.com/wontory/skills/commit/0bc4747b82d800abd79b07b927e380953d240acc) Thanks [@wontory](https://github.com/wontory)! - The `commit` and `pr` skills now follow the repo's own conventions: commitlint config, commit template, PR templates in more locations, and a non-Conventional PR title format when the repo uses one.

## 0.3.0

### Minor Changes

- [#3](https://github.com/wontory/skills/pull/3) [`cac6ac3`](https://github.com/wontory/skills/commit/cac6ac339c340c17c424a01567f141c97d37f82b) Thanks [@wontory](https://github.com/wontory)! - Make the `commit` and `pr` skills follow an explicit language rule from the project instructions, or else the language of the recent commits and PRs, instead of always writing English. The detected language can be saved as a rule so later runs skip detection.

## 0.2.0

### Minor Changes

- [#2](https://github.com/wontory/skills/pull/2) [`f6a4eea`](https://github.com/wontory/skills/commit/f6a4eea61195d2ee079cd869a0b69436f076b1bd) Thanks [@wontory](https://github.com/wontory)! - Show the skill and agent pickers when run in a terminal. `--yes` and non-interactive environments still install everything.
