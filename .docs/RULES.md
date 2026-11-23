# Rules

> Mandatory workflow for non-trivial development tasks. Adapt detail to task size, but do not skip traceability.

## Before starting

1. **Understand the request**. Read relevant `.docs/*`, code, and constraints. Ask only necessary clarifying questions.
2. **Requirements**. For feature work, use `create-spec` to turn the request into a spec at `./specs/[name].md`, or `feature-concept` directly for a deep grilling session — both delegate the spec decisions to `feature-concept`. Use `refine-spec` on an existing spec that is vague, stale, or missing acceptance criteria. Every spec must end with requirements and observable acceptance criteria.
3. **Plan**. For substantial work, `implement-me` creates/updates a plan in `./.plans/[spec-file-name]-plan.md` and waits for approval before coding.
4. **Spec execution**. Use `/implement-me <spec-name>` for end-to-end spec execution; use `orchestrate-me` for parallel spec ranges when appropriate.

## During implementation

- Follow `AGENTS.md`, `ARCHITECTURE.md`, `DEVELOPMENT.md`, `DESIGN.md`, and `DESIGN_SYSTEM.md` as applicable.
- For UI work, load required design skills before coding.
- Prefer small, verifiable increments; keep changes scoped.
- Do not invent commands, architecture, or product behavior—verify against code/config.

## End of iteration / delivery

Provide:

1. **Architectural decisions**: create an ADR in `./.adrs/*.md` for meaningful architectural decisions; summarize it.
2. **Manual QA steps**: concrete steps to validate behavior.
3. **Modified files**: list of changed files.
4. **Dependencies added**: packages added/removed and why.
5. **Rationale**: why the approach was chosen, tradeoffs, and follow-ups.
6. **Quality checks**: report commands run and outcomes per `QA.md`.

## Commit/push

- **At the end of every spec execution**, run `/commit-and-push` to commit and push the completed work. It is a mandatory delivery step, not optional.
- `/commit-and-push` inspects `git status` and the full diff (including untracked files), derives a Conventional Commit message unless one is supplied as `$ARGUMENTS`, stages all pending changes with `git add -A`, commits with OpenCode as co-author, and pushes the current branch.
- Use Conventional Commits (`<type>(<scope>): <subject>`). Every commit produced by this workflow must end with:

  ```
  Co-authored-by: OpenCode Agent <opencode@opencode.ai>
  ```

- Pass an optional exact subject when useful, e.g. `/commit-and-push 'feat(api): add hello-world endpoint'`.
- Inspect `git status` before running the command; the command must never force-push, amend, or rewrite history, and must not disable hooks (`--no-verify`).
- If a hook or push fails, fix the cause and retry once; if it still fails, report the exact error instead of bypassing the gate.
