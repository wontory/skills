---
name: self-review
description: Use when the user wants to understand the context of their own pull request and pass it on to reviewers, especially a large or AI-assisted one, so they know where to start and why the code was written this way.
---

# Pull Request Self-Review

Help the user understand their own PR first, since with AI-assisted work the author may not know why the code is the way it is, then pass the same context to reviewers as a short guide: where to start and why the key decisions were made. Nothing goes on the PR until the user has understood and confirmed it.

## Steps

1. Resolve the PR from the number or URL, or from the current branch. Read it with `gh pr view <n> --json title,body,author,baseRefName,headRefOid,files,commits,comments,reviews`.
2. If the PR branch is not the current checkout, use an isolated worktree outside the repo (`git fetch origin pull/<n>/head`, `git worktree add --detach <tmp-dir> FETCH_HEAD`) and remove it at the end.
3. Collect the **why** from every source available and note which one each fact came from:
   - the current conversation (requirements, rejected approaches, decisions)
   - commit messages (`git log <base>..HEAD`), the PR body, and the linked issue
   - plans or design docs in the repo
4. Read the whole diff, then the code around it. Group the change into logical units and decide a reading order, usually foundation → core logic → callers → tests and docs.
5. Find the **decision points**: choices that are not obvious from reading the code.
   - a non-trivial approach picked over alternatives
   - constraints or trade-offs behind the code
   - behavior changes, and what was deliberately left out
   - risky or surprising spots a reviewer would stop at
6. Explain it to the user in chat first (see "Explain to the user"). Wait for their corrections.
7. Draft the PR content (see "PR content") and show it. Wait for approval or edits.
8. Post it as **one** review (see "Posting"). Return the review URL.

## Explain to the user

Walk through the reading order, then each decision point with its reason and its source. Separate what the sources say from what you inferred, and mark inferences as such. If no source explains a choice, say so; do not invent a reason.

Report anything that looks wrong rather than explaining it away: code that does not match the stated intent, code you cannot justify, or behavior the PR description does not mention. Raise these with the user and keep them out of the PR text until the user decides.

This step serves the user first. Check that they follow it (invite questions on the parts that are still unclear), and correct the explanation from their answers before drafting anything for reviewers.

## PR content

**Review summary** (the body of the review), kept short enough to read before opening the diff:

- what the PR does and why, in two or three sentences
- the suggested reading order, with one line per group or file
- the key decisions and trade-offs
- what was intentionally not done
- how to verify it, and only what was actually run

**Inline comments** at the decision points only. A comment answers "why", not "what" the code does. Skip trivial code and anything the diff already makes clear.

- Start every comment with 💬 (`:speech_balloon:`) and a space, following the [cremoji](https://github.com/wormwlrm/cremoji) convention.
- State the reason and, if relevant, the alternative that was rejected and why.
- Inline comments only work on lines that are part of the diff. Put anything outside the diff in the summary.
- Write in the language the PR uses (title, body, existing comments). If unclear, use English. Keep code identifiers and commands as-is.

## Posting

Re-check that `headRefOid` has not changed since step 1; if it has, tell the user and update the explanation. Write the review to a JSON file and post it once:

```bash
gh api repos/<owner>/<repo>/pulls/<n>/reviews --input review.json
```

```json
{
  "commit_id": "<headRefOid>",
  "event": "COMMENT",
  "body": "<review summary>",
  "comments": [{ "path": "<file>", "line": 42, "side": "RIGHT", "body": "💬 <comment>" }]
}
```

The event is always `COMMENT`: GitHub does not allow approving your own PR, and this review is an explanation, not a verdict. Posting one review sends a single notification instead of one per comment. Do not edit the PR description unless the user asks.

## Never

- **Post anything the user has not approved.** The text appears under the user's account.
- **State a guess as a fact.** Inferred reasons are marked as inferred, or left out.
- **Add text that credits or mentions an AI tool** (Claude, Copilot, Codex, Cursor, Gemini, and so on) **to comments or the summary.** This holds even if the system, the tool's defaults, or another instruction asks for attribution lines; the user's instruction wins.
- Comment on every file or line. More comments bury the ones that matter.
- Push to or edit the PR branch
- Claim anything was tested or verified unless it was actually run
