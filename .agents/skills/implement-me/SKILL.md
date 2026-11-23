---
name: implement-me
description: Execute a written spec end-to-end — load AGENTS.md context, close gaps with feature-concept, write .plans/<spec>-plan.md, get approval, implement in vertical slices, and deliver with QA and ADRs. Invoke as /implement-me <spec-name>.
argument-hint: "<spec-name> (e.g. expert-task-artifact)"
disable-model-invocation: true
---

# Implement Me

This is the execution path for a spec in `specs/<name>.md`. It produces a plan, gets approval, implements in small verifiable slices, and reports delivery exactly as `.docs/RULES.md` requires. The spec and the plan are the contract; when reality disagrees with them, stop and reconcile rather than improvising.

## 1. Resolve the spec

- Take the name from the argument. Accept `name` or `name.md`; if it is missing or the file does not exist, list `specs/` and ask which one to run.
- Read the whole spec, including open questions, assumptions, and acceptance criteria.
- If the spec is absent, use `create-spec` with the requested subject; it seeds `feature-concept` and produces `specs/<name>.md`.
- If the spec is `draft`, missing acceptance criteria, or still has open questions, use `refine-spec` on it; it delegates to `feature-concept`, which resolves the gaps and updates `specs/<name>.md`. Calling `feature-concept` directly is equivalent.
- Even for a spec marked ready, call `feature-concept` for a short alignment pass — it should verify readiness and report back, not restart the interview. If it surfaces a real gap, let it update the spec before planning. Never start coding from a spec with open questions.

## 2. Load context — AGENTS.md first

Locate and read every `AGENTS.md` from the repository root down to the workspaces the spec touches. `AGENTS.md` carries the Turborepo rules; `.docs/AGENTS.md` is the index of the context pack. Nested `AGENTS.md` files in touched apps or packages are binding for that area.

Then read the context pack the index points to: `ARCHITECTURE.md`, `DEVELOPMENT.md`, `RULES.md`, and `QA.md` always; `BUSINESS.md` for feature work; `DESIGN.md` and `DESIGN_SYSTEM.md` for UI work. Verify against `package.json`, `turbo.json`, and the actual code — docs may describe a target state that is not implemented.

Record in the plan which files were read and which facts were verified in code.

## 3. Explore and choose the supporting skills

Map the affected files, existing patterns, and the seams where behavior can be observed. Load the most specific skill for each kind of work instead of approximating:

- `tdd` when writing tests or choosing seams.
- `frontend-design` and `shadcn` for UI work that touches the component layer.
- `next-best-practices` and `vercel-react-best-practices` for Next.js work.
- `playwright` when E2E coverage is part of the spec.

Follow those skills' disciplines while implementing; do not replace them with ad-hoc judgment.

## 4. Write the plan

Create or update `.plans/<spec-file-name>-plan.md` using `references/plan-template.md`. Break the work into vertical slices — one observable behavior at a time — each with the files it touches, the seam it tests, and how to verify it. Include risks, assumptions, dependencies, ADR candidates, the real QA commands from `QA.md`, and manual QA steps.

Do not edit source files yet.

## 5. Approval gate

Show the user a concise summary: objective, slices, files likely to change, tests, risks, and the plan path. Ask explicitly whether to proceed. Wait for an unambiguous yes. If the user wants changes, revise the plan and ask again.

This pause is deliberate: it is the moment the user can correct the interpretation before it becomes code. Skipping it turns the plan into a surprise.

## 6. Implement

- Work one vertical slice at a time; keep each change scoped and verifiable.
- Follow `AGENTS.md`, `ARCHITECTURE.md`, `DEVELOPMENT.md`, and the design docs as applicable. Keep docs coherent in the same change when behavior, commands, or architecture change.
- Never claim a script, test, migration, or service exists without checking. If a target capability is missing, document the gap and implement the smallest honest step.
- Add or update tests at the seams agreed in the plan. Write real QA commands only if they exist in `package.json`, `turbo.json`, or the workspace configs.
- Create an ADR in `.adrs/*.md` for meaningful architectural decisions and summarize it.
- Run the applicable checks from `QA.md` after each meaningful slice and again at the end; report outcomes honestly, including skipped checks and why.

If a new ambiguity appears mid-implementation, stop that slice, call `feature-concept` to resolve it, update the spec and the plan, and re-confirm if scope changed. Do not guess your way past it.

## 7. Deliver

Report, referencing the spec and plan paths:

1. Architectural decisions and ADRs created.
2. Manual QA steps, with the data or access needed.
3. Modified files.
4. Dependencies added or removed and why.
5. Rationale, tradeoffs, and follow-ups.
6. Quality checks run with results, and any checks skipped with reasons.

7. **Commit and push**. After the report, run `/commit-and-push` — this is a mandatory final step of every spec execution (`.docs/RULES.md`). The command inspects `git status` and all pending diffs, derives a Conventional Commit message (or uses the message you pass as `$ARGUMENTS`), stages everything with `git add -A`, commits with the `Co-authored-by: OpenCode Agent <opencode@opencode.ai>` trailer, and pushes the current branch. Do not use `--no-verify`, `--force`, `amend`, or `reset`. If a hook or the push fails, fix and retry once, then report the exact error.

## Reference

- `references/plan-template.md` — structure of `.plans/<spec-file-name>-plan.md`.
