---
name: orchestrate-me
description: Implement a range of numbered specs end-to-end with one background subagent per spec, isolated git worktrees, per-spec plan approval, consolidated integration/QA and a single final push. Invoke as /orchestrate-me <start>-<end> (e.g. /orchestrate-me 001-010). Use when the user asks to implement several specs at once, mentions a spec interval or range, says "implement specs 001 to 010" / "todas as specs de 001 a 010", or wants parallel spec delivery.
argument-hint: "<start>-<end> (e.g. 001-010)"
disable-model-invocation: true
---

# Orchestrate Me

`implement-me` is the contract for one spec. This skill runs that contract for many numbered specs at once: you are the orchestrator, not the implementer. Each spec gets its own background subagent, its own git worktree, its own approval gate and its own local commit. You own dependency scheduling, progress reporting, integration, combined QA and the final push.

Parallelism is only safe with isolation. A worktree created for a spec starts detached from HEAD, so the baseline must be clean and each subagent must create its own branch before editing. A subagent that edits the original checkout can silently destroy another spec's work — treat that as a hard boundary.

## 1. Parse and validate the range

- Accept `NNN-NNN` (three digits preferred). Normalize to zero-padded three-digit numbers; the range is inclusive and `start <= end`. Reject malformed input with an example instead of guessing.
- Resolve every number to exactly one `specs/<NNN>-*.md`. Exclude `_template.md`. If a number is missing or ambiguous, stop, list the affected numbers, and ask whether to skip them or correct the range. Never invent a spec.
- Read each spec's `Status`, goals, non-goals and scope. A spec that is `draft`, missing acceptance criteria, or still has open questions is blocked: ask whether to run `refine-spec`/`feature-concept` first or exclude it. Do not launch a subagent for a blocked spec without that decision.
- Announce the resolved list: numbers, slugs, statuses and total count. This list is the contract for the run.

## 2. Load context and verify the baseline

- Read `AGENTS.md` from the repository root down to the affected workspaces, then `.docs/AGENTS.md` and the context pack it indexes: `ARCHITECTURE.md`, `DEVELOPMENT.md`, `RULES.md`, `QA.md`, plus `BUSINESS.md` for feature work and `DESIGN.md`/`DESIGN_SYSTEM.md` for UI work. Verify claims against `package.json`, `turbo.json` and code; docs may describe a target state that does not exist.
- Check `git status --short` in the original checkout. Worktrees branch from HEAD, so uncommitted changes and untracked files are invisible to subagents. If the tree is not clean, stop and ask the user to commit or stash before continuing. Do not commit the user's pending work on their behalf.
- Record the current branch and its remote; this is the integration branch for step 8.

## 3. Dependency and overlap preflight

- Extract in-range dependencies from each spec's scope, non-goals and "inherits from" / "current from" language. Also flag obvious shared files — migrations, `package.json`, context docs — that more than one spec is likely to touch.
- If any spec depends on another spec in the range, show the dependency map and ask the user to choose:
  - **Wave mode** (default when dependencies exist): run independent specs first, then dependent specs after their prerequisites are merged. Still parallel inside each wave.
  - **Forced full parallel**: start every spec together, accepting that integration conflicts are likely and will be resolved during merge.
- If there are no in-range dependencies, proceed with full parallel and simply report the overlap risks you found.

## 4. Create one worktree per spec

- For each spec in the current wave, call Code Mode `tools.opencode.worktree_create({ name: "orchestrate-<start>-<end>-<NNN>-<slug>" })` and record the returned absolute path.
- The worktree starts on a detached HEAD. The subagent creates `orchestrate/<start>-<end>/<NNN>-<slug>` as its first action, then works only inside that path.
- Never create a worktree while the baseline is dirty (step 2), and never ask a subagent to share the original checkout. If the worktree tool is unavailable, stop and explain that parallel isolated execution cannot run here; do not fall back to editing one working tree in parallel.

## 5. Phase 1 — parallel planning

- Launch one `general` subagent per spec in the current wave with the `subagent` tool: a short `description` containing the spec slug and the phase-1 prompt from `references/subagent-prompt.md` with **every** placeholder filled in. `general` has the tool access `implement-me` needs and cannot spawn further subagents, which is intentional.
- Launch all subagents of a wave in the same turn so they truly run in parallel. Subagents always run in the background: do not poll or sleep. Process `<subagent>` notifications as they arrive and end your turn while they work.
- Keep a progress table in chat and update it on every notification:

  | Spec | Worktree | Session | Phase | Last update | Blockers |
  | ---- | -------- | ------- | ----- | ----------- | -------- |

- The phase-1 prompt limits the child to `implement-me` steps 1–5: resolve and verify the spec, load context, choose supporting skills, write `.plans/<spec-file-name>-plan.md`, then stop and report `Awaiting approval`. The child asks the user nothing and does not implement, commit or push.

## 6. Per-spec approval gates

- When a phase-1 report arrives, show the user that spec's plan path, objective, slices, likely files, tests, risks and any spec edits. Ask for an explicit yes for that spec (use the `question` tool if available). Wait for an unambiguous answer.
- On **yes**, resume the **same child session** with the returned `sessionID` and the phase-2 prompt from `references/subagent-prompt.md`. Include whether the spec's in-range dependencies are already merged into the integration branch.
- On **no**, tell the child to stop, mark the spec `skipped` in the progress table, and leave its worktree untouched until cleanup. Remove a worktree with uncommitted changes only after explicit user confirmation.
- Approvals are per spec, but implementations overlap: a spec the user approved starts implementing immediately while you finish asking about the others. This keeps the gate without serializing the run.

## 7. Monitor active subagents

- Update the progress table and relay a concise progress line on every `<subagent>` notification. For detail, read the child's status file at `<worktree>/.plans/orchestrate-<start>-<end>/<NNN>-<slug>.status.md`.
- If a child surfaces a new ambiguity, resolve it the way `implement-me` would — call `feature-concept` in the child's worktree, update the spec and plan, and resume only after the scope change is reported. Do not answer scope questions on the user's behalf.
- If a child reports blocked or failed, mark it in the table, report the exact reason, and ask whether to retry, refine the spec, or skip. Never silently drop a spec.

## 8. Integrate

- Wait until every active child reports `DONE`, `blocked`, `skipped` or `failed`. Verify each successful worktree: branch exists, commit exists, `git -C <worktree> status --short` shows no uncommitted source/plan/ADR/spec changes (the progress status file may remain uncommitted), and its status file says `done`.
- From the original checkout, merge branches in ascending spec order with `git merge --no-ff --no-edit orchestrate/<start>-<end>/<NNN>-<slug>`. Skip specs with no commit. Stop on the first conflict, report the exact files and ask the user; keep the worktrees for diagnosis.
- In wave mode, release the next wave only after the previous wave's branches are merged, and tell those children that their dependencies are now in the integration branch.
- After all merges, run the consolidated checks from `.docs/QA.md` on the integrated tree. Attribute failures to specs, fix integration-only breakage, and report checks run and skipped with reasons.

## 9. Deliver, push and clean up

- Aggregate each child's delivery report per `.docs/RULES.md`: ADRs, manual QA with needed data/access, modified files, dependencies added or removed, rationale/tradeoffs/follow-ups, and quality checks with outcomes.
- Run `/commit-and-push` once for any changes left pending after integration. If it reports "nothing to commit", still verify the integration branch is pushed (`git status -sb`, then `git push`, or `git push -u origin <branch>` when no upstream exists). Never use `--force`, `amend`, `reset` or `--no-verify`.
- Remove worktrees with Code Mode `tools.opencode.worktree_remove({ directory })`. Use `force: true` only with explicit user confirmation. Keep worktrees that failed to merge until the conflict is resolved.
- Final report: table of every spec with status, plan path, ADRs, commit SHA and QA result; merged branch and push result; skipped checks; conflicts resolved; and follow-ups.

## Inherited rules and orchestration overrides

- Each child follows `implement-me` in full, with these overrides: the orchestrator owns user interaction; the approval gate happens before implementation; the child commits locally in its worktree and never pushes or runs `/commit-and-push`; all paths are worktree-scoped; progress is reported through the status file and short messages after each slice.
- A child must never guess past ambiguity, claim a command exists without checking, or edit outside its worktree. These are the same rules `implement-me` applies to a single spec, enforced across N parallel runs.

## References

- `references/subagent-prompt.md` — exact phase-1 and phase-2 prompts plus the status-file format.
- `implement-me` — the single-spec execution contract.
- `.docs/RULES.md` — delivery checklist and commit/push requirements.
- `.docs/QA.md` — quality checks used for both per-spec and consolidated verification.
