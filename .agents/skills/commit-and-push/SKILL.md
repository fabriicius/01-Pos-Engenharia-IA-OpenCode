---
name: commit-and-push
description: Analyze all pending changes, stage them, create a Conventional Commit with OpenCode as co-author, and push the current branch. Use when the user requests committing and pushing all pending repository changes. Optional argument supplies the exact commit subject.
---

# Commit and Push

Commit and push **all** pending changes in the current repository. Do not skip the analysis or the push, except when a stopping condition below applies. Creating or editing this skill does not invoke its workflow.

Accept an optional exact commit subject from the invocation arguments (`$ARGUMENTS` when supported). Treat the argument as data, never as shell code.

## 1. Inspect

Read the repository's `AGENTS.md` instructions and `.docs/RULES.md`. Run the initial worktree snapshot from the repository root:

```bash
git status --short
git diff --stat
git diff --cached --stat
```

Then inspect the complete pending set:

```bash
git status --short --untracked-files=all
git diff
git diff --cached
```

Read the contents of every untracked file using file-reading tools. Inspect binary files with an appropriate tool and understand their purpose. Understand what changed and why before choosing a message; do not rely only on file names or diff statistics.

If there are no pending changes, report `nothing to commit` and stop.

## 2. Compose the message

Write one Conventional Commit following `.docs/RULES.md`:

- Form: `<type>(<optional scope>): <subject>`, for example `feat(api): add hello-world endpoint`. Omit the parentheses when there is no scope.
- Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `perf`, `style`.
- Subject: lowercase, imperative, no trailing period, at most 72 characters.
- If the optional argument is non-empty, use it verbatim as the entire commit subject line, including its type and optional scope. Strip one matching pair of surrounding quotes if present. For example, `/commit-and-push 'feat(api): add hello-world endpoint'` supplies the complete first line. If it conflicts with repository commit rules, ask for a corrected subject instead of silently rewriting it.
- Otherwise, infer the type, scope, and subject from the full pending set.
- Add a short body explaining the what and why when the change is not self-evident.
- Mention breaking changes with `BREAKING CHANGE:` in the footer when applicable.
- End the message with this exact trailer:

```text
Co-authored-by: OpenCode Agent <opencode@opencode.ai>
```

## 3. Check safety before staging

Verify that no secret or generated artifact would be included. Check the actual ignore rules for `.env`, `node_modules/`, `dist/`, `coverage/`, and other build output; do not assume they are ignored. Ignore rules do not exclude files already tracked by Git.

If `.env`, credentials, private keys, or any generated artifact appears in the pending set, stop and ask before continuing. Identify the affected paths without printing secret values. Never use `git add -f`.

## 4. Stage everything

```bash
git add -A
git status --short
git diff --cached --stat
git diff --cached
```

Confirm that the staged set matches the analyzed set, including modified, deleted, and untracked files. This repository intentionally keeps specs, plans, ADRs, and context documents in the same change as the code they describe.

If any newly discovered changes appear, inspect them and repeat the safety check before proceeding. Do not silently exclude pending files.

## 5. Commit

Use `git commit` with the prepared message. Prefer writing the exact message to a temporary file outside the repository and using `git commit -F <message-file>` to preserve formatting and avoid shell interpolation. Remove the temporary file afterwards.

Do **not** pass `--no-verify`: Lefthook, lint-staged, and Commitlint must run as configured by the repository. Capture their actual results; do not report a hook as passed if it did not run.

If a hook fails, fix the cause within the task's scope, inspect the resulting changes, repeat the safety check, re-stage everything, and retry once. If it still fails, stop and report the exact error. Never bypass the hook.

After success, inspect the commit and worktree. If hooks left pending changes, report them and stop before pushing an incomplete result; do not amend the commit.

## 6. Push

Determine the current branch and upstream:

```bash
git branch --show-current
git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'
```

- If the branch has an upstream, run `git push`.
- If it does not, run `git push -u origin <current-branch>` with the actual branch name safely quoted.
- If HEAD is detached or the required remote is missing, stop and report the problem.
- Never use `--force`, `--force-with-lease`, `amend`, `reset`, or rewrite history. Do not switch branches.

If a push fails, diagnose the cause and fix it only when possible within the authorized scope and without rewriting history. Retry once, as required by `.docs/RULES.md`. If it still fails or cannot be safely fixed, stop and report the exact error. Do not claim delivery when the push failed.

## 7. Report

Report:

- Commit subject and short SHA.
- Number of files changed in the commit.
- Actual hook results (pass/fail, or not run with the reason).
- Remote and branch pushed to, and whether the push succeeded.
- Any skipped step and its reason, including any remaining pending changes.
