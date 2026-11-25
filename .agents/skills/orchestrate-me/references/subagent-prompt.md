# Subagent prompt templates

Use these prompts verbatim, filling every placeholder. A child session starts with fresh context, so each prompt must contain all paths and rules it needs. The parent sends phase 2 as a follow-up to the **same** `sessionID` returned by the phase-1 `subagent` call.

## Phase 1 — plan only

```text
You own exactly one spec in an orchestrated parallel run. You are a child subagent; the parent orchestrator handles user interaction, integration and the final push.

- Spec: specs/<NNN-slug>.md
- Range: <start>-<end>
- Your worktree (treat this as the repository root): <absolute worktree path>
- Your branch: orchestrate/<start>-<end>/<NNN>-<slug>
- In-range dependencies: <comma-separated NNN-slug list, or "none">
- Integration branch (created by the parent; do not switch to it): <branch name>
- Status file (inside your worktree): .plans/orchestrate-<start>-<end>/<NNN>-<slug>.status.md

Rules:

1. Use the worktree path above as the root for every read, write, edit and shell command. Set it as `workdir` on shell calls. Never edit files in the original checkout or in another worktree. Read AGENTS.md and the context pack from this worktree.
2. The worktree starts on a detached HEAD. Before any edit, create your branch there: `git switch -c orchestrate/<start>-<end>/<NNN>-<slug>`.
3. Load and follow the `implement-me` skill, steps 1 through 5 only: resolve and verify the whole spec (use refine-spec / feature-concept if it is not ready), load AGENTS.md and the context pack, choose the supporting skills, and write .plans/<spec-file-name>-plan.md using references/plan-template.md.
4. Stop after the plan. Do NOT implement, commit, or push. Do NOT call /commit-and-push. Do NOT use the `question` tool or ask the user anything; end your turn with a concise report ending in the exact sentence `Awaiting approval — <NNN-slug>.`
5. Update the status file after each meaningful step and emit one short progress message after each update, for example `planning: spec loaded`, `planning: slices defined`, `blocked: open question about token expiry`. Keep each message to one or two sentences; the parent relays it to the user while you work.
6. If the spec is not ready, resolve the gap with feature-concept in your worktree and record the spec edit in your report. If the gap cannot be resolved without a user decision, mark the status file `blocked`, report the exact question, and stop.

Status file format:

# <NNN-slug> — orchestration status

- Spec: specs/<NNN-slug>.md
- Worktree: <absolute worktree path>
- Branch: orchestrate/<start>-<end>/<NNN>-<slug>
- Phase: planning | awaiting-approval | implementing | qa | done | blocked | skipped
- Last update: <ISO timestamp>
- Commit: pending
- QA: not started

## Progress

- <ISO timestamp> — <short note>

Report back:

- plan path
- objective in one sentence
- slices as bullets
- files likely to change
- tests and QA commands
- risks and assumptions
- spec edits made, if any
- `Awaiting approval — <NNN-slug>.`
```

## Phase 2 — implement after approval

Send this as a follow-up to the same child session, replacing the numbered placeholders. Only include the dependency merge line when the parent says the dependencies are ready.

```text
The user approved the plan for <NNN-slug> on <date>. Continue `implement-me` from step 6 in the worktree you already created. The orchestration overrides below take precedence over the corresponding lines in `implement-me`:

- Stay inside <absolute worktree path> for every read, write, edit and shell command. Never touch the original checkout or another worktree.
- Dependency line: <"Your in-range dependencies are merged into <integration branch>; run `git merge --no-edit <integration branch>` in your worktree before the first slice." OR "You have no in-range dependencies; do not merge the integration branch.">
- Implement one vertical slice at a time. After each slice, append to the status file, emit a short progress message, and run the applicable check from .docs/QA.md. Move the status phase from `implementing` to `qa` when the last slice is done.
- Keep docs coherent in the same change. Create ADRs in .adrs/ inside your worktree for meaningful decisions.
- If a new ambiguity appears, call feature-concept in your worktree, update the spec and plan, report the scope change to the parent, and do not guess past it.
- Commit locally in your branch with a Conventional Commit and the exact trailer `Co-authored-by: OpenCode Agent <opencode@opencode.ai>`. Do NOT push. Do NOT call /commit-and-push — the parent pushes once after all branches are merged.
- After committing, set the status file to `done` with the short commit SHA and the QA outcome. Leave that final status-file update uncommitted: it is a progress artifact for the parent, not part of the merged change. Every source, plan, ADR and spec edit must be committed. Never claim a check passed without running it; report skipped checks with reasons.
- End your turn with a delivery report: ADRs created, manual QA steps with needed data/access, modified files, dependencies added/removed and why, rationale/tradeoffs/follow-ups, quality checks run and skipped, commit short SHA, and the exact sentence `DONE — <NNN-slug>.`
```

## Progress expectations

Both phases use the same status file so the parent can report continuous progress without polling. Keep notes factual and timestamped. The parent updates its chat table from each `<subagent>` notification; a child that goes silent for a long stretch should still have written its current phase and last step to the status file.
