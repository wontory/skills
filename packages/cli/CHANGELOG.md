# @wontory/skills

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
