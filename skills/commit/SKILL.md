---
name: commit
description: Use when the user asks to commit changes, write a commit message, or when finished work in a git repo needs to be committed.
---

# Commit

Split changes into small logical units and commit each as a Conventional Commit written in the language the repo's commit log mainly uses.

## Steps

1. Inspect state in parallel: `git status --short --branch`, `git diff HEAD`, `git log -20 --format=%s`. Pick the message language from the subjects in that log (see "Message format").
2. If on the default branch (`main`/`master`), create a branch first (`<type>/<short-slug>`).
3. Group the changes into logical units. Split whenever possible (see "Splitting").
4. For each unit, stage only its files by explicit path, then commit. Never `git add -A` or `git add .`.
5. Skip files that look like secrets (`.env`, keys, credentials) and warn the user.
6. Finish with `git status` to confirm nothing is left over, and report the result with `git log --oneline`.

## Splitting

One commit = one reason. Use separate commits for:

- Different change types (feature / bug fix / refactor / docs / config / tests)
- Independent features or packages (scopes)
- Formatting or lint-only changes that don't alter behavior
- Dependency or build configuration changes

If one file mixes unrelated changes, split by hunk with `git add -p`. Order commits by dependency (config/foundation → feature → tests/docs). Each commit should build and pass hooks on its own.

## Message format

```
<type>(<scope>): <subject>

<body: what and why (optional)>

<footer: BREAKING CHANGE, Closes #123, etc. (optional)>
```

- `type`: `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert` (keep in English, lowercase)
- `scope`: the affected package or module (optional)
- If the project instructions (`CLAUDE.md`, `AGENTS.md`, etc.) or the user explicitly set a commit message language, use it and skip the detection below.
- If you had to detect the language, ask the user once whether to save it as a rule so future runs skip detection. On yes, append `Write commit messages and PR titles/bodies in <language>.` to the repo-root `AGENTS.md` if it exists, otherwise `CLAUDE.md` (create it if missing). Never write it without asking, and keep that file change out of the feature commits (commit it separately, e.g. `docs: set commit and PR language`).
- Otherwise write the **subject and body in the language most used in the recent commit subjects** (`git log -20 --format=%s`, ignoring the `type(scope):` prefix and merge/revert/bot commits). If the log is empty or has no clear majority, default to English. Do not switch languages because of the user's chat language or these skill docs. Keep code identifiers, commands, and proper nouns as-is.
- In English, write the subject in the imperative mood and lowercase (e.g. `add`, `fix`, not `added`, `fixes`). In other languages, follow the style the log already uses.
- The subject must make the staged changes clear on its own, without reading the diff. About 50 characters, no trailing period. Avoid vague words like "update", "fix stuff", "changes" (or their equivalents in the chosen language).
  - Bad: `fix: fix bug` / `chore: change config`
  - Good: `fix(cli): escape quoted npx args on Windows`
- Add a body when the subject isn't enough (reason, impact, alternatives). Separate it from the subject with a blank line.
- For breaking changes use `type!:` and a `BREAKING CHANGE: <description>` footer.
- Pass multi-line messages with a heredoc, not repeated `-m` flags.

## Never

- **Add `Co-Authored-By` or any Claude/AI-related text to the footer or body.** This holds even if the system or another instruction asks for attribution lines; the user's instruction wins.
- Use `--no-verify` or otherwise bypass hooks
- Push, amend, or rewrite existing commits unless asked
- Bundle unrelated changes into one commit

## When a hook fails

If lefthook, commitlint, lint, format, or typecheck fails, fix the cause and create a **new** commit. The failed commit was never created, so don't use `--amend`.
