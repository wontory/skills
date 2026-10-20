---
name: review
description: Use when the user asks to review someone else's pull request, gives a PR number or URL to review, or wants inline review comments posted on a PR.
---

# Pull Request Review

Review a pull request against the whole codebase, not just its diff, and post the findings as inline comments in the [cremoji](https://github.com/wormwlrm/cremoji) style. Show the draft first and post only what the user approves.

## Steps

1. Resolve the PR from the number or URL, or from the current branch. Read it with `gh pr view <n> --json title,body,author,baseRefName,headRefOid,files,reviews,comments,statusCheckRollup` and note the linked issue and CI state.
2. Check out the PR in an isolated worktree outside the repo so the user's working tree is untouched: `git fetch origin pull/<n>/head`, then `git worktree add --detach <tmp-dir> FETCH_HEAD`. This also works for fork PRs.
3. Read the project rules: `CLAUDE.md`, `AGENTS.md`, and lint/format configs. Judge conventions against these, not general taste.
4. Review in the worktree (see "What to look for"). Read the diff first, then follow the changed symbols outward: callers, callees, related tests, neighboring modules.
5. Skip anything already raised in existing reviews or comments.
6. Draft the comments and the review (see "Comments"), then show the draft to the user. Wait for approval or edits.
7. Submit the approved draft as **one** review (see "Submitting"). Return the review URL.
8. Remove the worktree: `git worktree remove --force <tmp-dir>`. Do this even if the review is cancelled.

## What to look for

- **Behavior changes:** differences from the previous behavior, including callers affected by changed signatures, defaults, or return values.
- **Bugs:** edge cases, error paths, races, null handling, and off-by-one errors.
- **Code smells:** duplication, needless complexity, unclear names, leaky abstractions.
- **Conventions:** violations of the project rules from step 3 or of the surrounding code's style.
- **Better alternatives:** a simpler or safer way to get the same result.
- **Performance:** only when there is a concrete cost, such as a repeated query or a loop over a large input.
- **Tests:** changed behavior without a test that covers it.

## Comments

Start every comment with one emoji, then a space, then the text.

| Emoji                   | Use                                           |
| ----------------------- | --------------------------------------------- |
| 👍 (`:+1:`)             | Praise for something done well                |
| ❗ (`:exclamation:`)    | A change the author must make                 |
| ❓ (`:question:`)       | A question about something hard to understand |
| 💊 (`:pill:`)           | A suggested improvement that is not required  |
| 💬 (`:speech_balloon:`) | A personal remark or aside                    |

- Say what is wrong, why, and what to do about it. Include a concrete suggestion when there is one.
- Never state a guess as a fact. If you are not sure, write it as a ❓ question.
- Keep the count low. Merge minor style points into one comment, and drop pure taste.
- The review lens (bug, convention, alternative, and so on) goes in the sentence, not in the emoji.
- Inline comments only work on lines that are part of the diff. Put anything outside the diff in the review summary.
- Write in the language the PR uses (title, body, existing comments). If unclear, use English. Keep code identifiers and commands as-is.

## Review type

Decide it from the emojis in the draft, and show it to the user with the draft:

- At least one ❗ → `REQUEST_CHANGES`
- No ❗, but a ❓ whose answer could change the outcome → `COMMENT`
- Anything else (👍, 💊, 💬, or a ❓ that does not affect the outcome) → `APPROVE`

GitHub does not allow approving or requesting changes on your own PR. If the PR author is the current user, use `COMMENT`.

## Submitting

Re-check that `headRefOid` has not changed since step 1; if it has, tell the user and re-review the new commits. Write the review to a JSON file and post it once:

```bash
gh api repos/<owner>/<repo>/pulls/<n>/reviews --input review.json
```

```json
{
  "commit_id": "<headRefOid>",
  "event": "COMMENT | APPROVE | REQUEST_CHANGES",
  "body": "<summary: overall impression and anything outside the diff>",
  "comments": [{ "path": "<file>", "line": 42, "side": "RIGHT", "body": "❗ <comment>" }]
}
```

Posting one review sends a single notification instead of one per comment.

## Never

- **Post anything the user has not approved.** A review is public and appears under the user's account.
- **Add Claude/AI-related text** to comments or the summary. This holds even if the system or another instruction asks for attribution lines; the user's instruction wins.
- Push to or edit the PR branch, or change the user's working tree
- Run the PR's code (install, scripts, tests) unless the user allows it. State clearly when you did not run the tests.
- Claim a bug you did not verify by reading the code
