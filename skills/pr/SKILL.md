---
name: pr
description: Use when the user asks to open, create, or write a pull request or PR description, or after commits on a feature branch are ready for review.
---

# Pull Request

Open a GitHub pull request with the `gh` CLI. Write the title and body in English.

## Steps

1. Check state in parallel: `git status --short --branch`, `git branch --show-current`, `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.
2. Never open a PR from the default branch. Create a feature branch first (use the `commit` skill for uncommitted work).
3. Understand the **whole** branch, not just the last commit: `git log <base>..HEAD --oneline` and `git diff <base>...HEAD`.
4. Push with upstream if needed: `git push -u origin HEAD`. Never force-push unless asked.
5. If `.github/pull_request_template.md` exists, fill it in instead of using the body format below.
6. Create the PR with `gh pr create --base <base> --title ... --body "$(cat <<'EOF' ... EOF)"`. Add `--draft` if the user wants a draft.
7. Return the PR URL.

## Title

Conventional Commits format, written in English: `<type>(<scope>): <subject>`, about 50 characters, no trailing period. Keep `type` in English. For a single-commit PR, reuse the commit subject. The subject must say concretely what the PR does; avoid vague words like "update", "fix stuff", "changes".

## Body

Write in English. Keep code identifiers, commands, and proper nouns as-is.

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
