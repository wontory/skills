---
name: commit
description: Use when the user asks to commit changes, write a commit message, or says "커밋해줘", or when finished work in a git repo needs to be committed.
---

# Commit

Split changes into small logical units and commit each as a Conventional Commit written in Korean.

## Steps

1. Inspect state in parallel: `git status --short --branch`, `git diff HEAD`, `git log -5 --oneline`.
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
- Write the **subject and body in Korean**. Keep code identifiers, commands, and proper nouns as-is.
- The subject must make the staged changes clear on its own, without reading the diff. About 50 characters, no trailing period. Avoid vague words like "수정", "업데이트", "작업".
  - Bad: `fix: 버그 수정` / `chore: 설정 변경`
  - Good: `fix(cli): 윈도우에서 npx 인자 따옴표가 이스케이프되지 않는 문제 수정`
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
