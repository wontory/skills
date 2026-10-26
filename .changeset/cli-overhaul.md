---
'@wontory/skills': minor
---

Overhaul the installer CLI:

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
