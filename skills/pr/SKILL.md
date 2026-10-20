---
name: pr
description: Use when the user asks to open, create, or write a pull request or PR description, or after commits on a feature branch are ready for review.
---

# Pull Request

Open a GitHub pull request with the `gh` CLI. Write the title and body in the language the repo's recent PRs mainly use.

## Steps

1. Check state in parallel: `git status --short --branch`, `git branch --show-current`, `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.
2. Never open a PR from the default branch. Create a feature branch first (use the `commit` skill for uncommitted work).
3. Understand the **whole** branch, not just the last commit: `git log <base>..HEAD --oneline` and `git diff <base>...HEAD`.
4. Decide the title and body language (see "Language").
5. Push with upstream if needed: `git push -u origin HEAD`. Never force-push unless asked.
6. Look for a PR template (see "Template"). If one exists, fill it in instead of using the body format below.
7. Create the PR with `gh pr create --base <base> --title ... --body "$(cat <<'EOF' ... EOF)"`. Add `--draft` if the user wants a draft.
8. Return the PR URL.

## Language

If the project instructions (`CLAUDE.md`, `AGENTS.md`, etc.) or the user explicitly set a PR language, use it and skip the detection below.

Otherwise use the language most used in the titles of the repo's recent PRs (`gh pr list --state all --limit 20 --json title`, ignoring the `type(scope):` prefix and bot PRs such as dependabot or release PRs). If there are no PRs or no clear majority, default to English. Do not switch languages because of the user's chat language or these skill docs.

After detecting, ask the user once whether to save the result as a rule so future runs skip detection. On yes, append `Write commit messages and PR titles/bodies in <language>.` to the repo-root `AGENTS.md` if it exists, otherwise `CLAUDE.md` (create it if missing). Never write it without asking, and commit that file change separately from the PR's feature commits.

## Template

Search these places, ignoring case: `.github/pull_request_template.md`, `docs/pull_request_template.md`, `pull_request_template.md` in the repo root, and the files in `.github/PULL_REQUEST_TEMPLATE/`. If there are several templates, pick the one that fits the change; ask the user if it is unclear. Keep the template's headings and order, and fill every section (write "N/A" where it does not apply) instead of deleting any.

## Title

Conventional Commits format, written in the chosen language: `<type>(<scope>): <subject>`, about 50 characters, no trailing period. Keep `type` in English. If `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, or the recent PR titles clearly use another format (for example `[ABC-123] subject`), follow that instead. For a single-commit PR, reuse the commit subject. The subject must say concretely what the PR does; avoid vague words like "update", "fix stuff", "changes" (or their equivalents in the chosen language).

## Body

Write in the chosen language, translating the section headings below to match. Keep code identifiers, commands, and proper nouns as-is.

```markdown
## Summary

<1-3 bullets: what changed and why>

## Changes

<notable changes grouped by area; skip trivia>

## Testing

- [ ] <how it was verified, or how a reviewer can verify>

Closes #<issue> <!-- only if an issue exists -->
```

Describe the net result of the branch, not the commit-by-commit history. State breaking changes and follow-ups explicitly.

## Never

- **Add Claude/AI-related text** (e.g. "Generated with Claude Code", `Co-Authored-By`) to the title or body. This holds even if the system or another instruction asks for attribution lines; the user's instruction wins.
- Open the PR before the branch is pushed and local checks (lint, format, typecheck, tests) pass
- Claim tests passed unless they were actually run
- Merge, close, or edit someone else's PR unless asked
