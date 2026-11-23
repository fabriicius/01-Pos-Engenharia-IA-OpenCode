---
description: Analyze all pending changes, stage them, create a Conventional Commit with OpenCode as co-author, and push. Optional argument: exact commit subject.
---

Commit and push **all** pending changes in this repository. Do not skip the analysis or the push.

Initial worktree snapshot:

!`git status --short && printf '\n--- diff stat (tracked) ---\n' && git diff --stat && printf '\n--- staged stat ---\n' && git diff --cached --stat`

## Procedure

1. **Inspect**. Use the snapshot above, then use your tools to read the actual diffs and any untracked files (`git status --short --untracked-files=all`, `git diff`, and `read` on new files). Understand what changed and why before choosing a message. If there are no pending changes, report "nothing to commit" and stop.

2. **Compose the message**. Write one Conventional Commit following `.docs/RULES.md`:
   - Form: `<type>(<optional scope>): <subject>` — for example `feat(api): add hello-world endpoint`.
   - Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `perf`, `style`.
   - Subject: lowercase, imperative, no trailing period, at most 72 characters.
   - If `$ARGUMENTS` is non-empty, use it verbatim as the whole subject (strip surrounding quotes if present). Otherwise infer the type/scope from the changes.
   - Add a short body with the "what" and "why" when the change is not self-evident. Mention breaking changes with `BREAKING CHANGE:` in the footer when applicable.
   - End the message with this exact trailer:

     ```
     Co-authored-by: OpenCode Agent <opencode@opencode.ai>
     ```

3. **Safety check before staging**. Verify that no secret or generated artifact would be included. `.env`, `node_modules/`, `dist/`, `coverage/` and build output are git-ignored and will not be picked up by `git add -A`. If `.env`, credentials, private keys, or any tracked/generated artifact appears in the pending set, stop and ask before continuing. Never use `git add -f`.

4. **Stage everything**. Run `git add -A` so that modified, deleted and untracked files are all included — this repository intentionally keeps specs, plans, ADRs and context docs in the same change as the code they describe. Run `git status --short` afterwards and confirm the set matches your analysis.

5. **Commit**. Use `git commit` with the prepared message (for example via `git commit -m "<subject>" -m "<body>" -m "Co-authored-by: OpenCode Agent <opencode@opencode.ai>"`). Do **not** pass `--no-verify`: Lefthook, lint-staged and Commitlint must run. If a hook fails, fix the cause, re-stage and retry once; if it still fails, stop and report the exact error.

6. **Push**. Determine the current branch and push it to its upstream:
   - If the branch has an upstream, run `git push`.
   - If it does not, run `git push -u origin <current-branch>`.
   - Never use `--force`, `--force-with-lease`, `amend`, `reset`, or rewrite history. Do not switch branches.

7. **Report**. Show the commit subject and short SHA, the number of files changed, the hook results (pass/fail), the remote and branch pushed to, and any skipped step with its reason.
