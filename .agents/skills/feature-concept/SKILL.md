---
name: feature-concept
description: Deep, stateful grilling that turns a loose feature idea into an executable spec at specs/<name>.md. Use whenever a feature, plan, or design needs to be thought through before coding — the user mentions "feature concept", "grill me", "stress-test this plan", "vamos pensar essa feature", "definir requisitos", or an implement-me run needs missing requirements and acceptance criteria. Produces a written spec, not just a conversation.
argument-hint: "[feature idea or spec name]"
---

# Feature Concept

A concept is not an intention; it is a set of decisions you can defend. This skill walks the whole design tree with the user, resolves each branch, and commits the result to `specs/<name>.md` so `implement-me` can execute it without guessing. The artifact is the point — a long conversation that leaves no spec has failed.

The quality of the result tracks the quality of the user's answers, not the number of questions. Stay active: push back when a question is too shallow, say when scope is drifting, and treat "I don't know" as a real answer that means prototype or ADR, never a prompt to invent a default silently.

## 1. Anchor the session

- If the user named a spec, read `specs/<name>.md` first and continue from it. Accept `name` or `name.md`.
- When `implement-me` invokes this skill with a spec already marked ready, run a readiness check only: confirm the decision tree is closed and report back. Reopen branches only where a real gap appears; do not restart the full interview or rewrite the spec unnecessarily.
- Otherwise derive a short kebab-case slug from the subject, state it, and let the user correct it before writing.
- `create-spec` and `refine-spec` are the thin entry points that hand off here. When one of them delegates, treat its prompt as the seed and keep ownership of the interview and of the write.
- Match the user's language in the conversation. Write the artifact in English (per `.docs/DEVELOPMENT.md`).
- Do not rush to a plan. The interview is the work; the spec is its output.

## 2. Load context before asking

Locate and read `AGENTS.md` from the repository root down to the areas the feature will touch. `AGENTS.md` and `.docs/AGENTS.md` are mandatory; nested ones are mandatory for the workspaces involved. Then read the relevant `.docs/*`: `RULES.md`, `ARCHITECTURE.md`, `DEVELOPMENT.md`, `QA.md`; `BUSINESS.md` for product work; `DESIGN.md` and `DESIGN_SYSTEM.md` for UI work.

Verify every factual claim against code/config. Docs can describe a target state that does not exist yet.

Never ask a question the repository can answer. Explore instead, and tell the user which file answered it. This is what separates a deep interview from a shallow questionnaire.

## 3. Walk the decision tree in rounds

Map the subject as a tree: each decision opens the decisions that depend on it. Ask the **frontier** — every question whose prerequisites are already settled — as one numbered round. Do not put two dependent questions in the same round. After the answers, recompute the frontier and continue.

For each question:

- State the decision and why it matters to the implementation.
- Give your **recommended answer**, a one-line rationale, and the main tradeoff. The user should be reacting to a concrete proposal, not filling a blank.
- Offer two or three options when the space is known; otherwise ask openly.
- Make it answerable in the user's terms, not in architecture jargon.

Ask one question at a time if the user prefers it. Count progress in rounds, not questions; an ordinary session covers several rounds and dozens of decisions.

If a question cannot be answered by talking because the user needs something to react to (layout, interaction feel, wording), stop grilling that branch. Propose a throwaway prototype, look at it together, then answer the question in one line. Guessing at ungrillable questions is how sessions grow without converging.

## 4. Cover what makes the spec executable

Work through these dimensions. Skip one only when you can state why it does not apply, and record that reason in the spec.

1. Problem, user, and success signal.
2. Goals, non-goals, and hard boundaries.
3. Behavior, edge cases, error/loading/empty states, idempotency.
4. Domain vocabulary aligned with `.docs/BUSINESS.md`.
5. Data, connectors, persistence, and source traceability.
6. UX, accessibility, and responsiveness for UI work.
7. Architecture seams and layering aligned with `ARCHITECTURE.md`.
8. Test seams and strategy, using `tdd` vocabulary.
9. Security, privacy, and observability.
10. Migration, rollout, flags, and rollback.
11. ADR-worthy decisions and rejected alternatives.
12. Acceptance criteria in Given/When/Then form.

See `references/question-bank.md` for concrete questions per dimension. Use it as a source of branches to probe, not a script to recite.

## 5. Close the session

The frontier is empty when every branch is resolved as one of: an explicit user decision, a verified repository fact, or a recommendation the user accepted. No silent assumptions.

Read back a short shared-understanding summary — goals, non-goals, key decisions, acceptance criteria count, and anything deliberately deferred — and ask the user to confirm or correct it. Only after confirmation:

- Create `specs/` if needed and write `specs/<name>.md` using the canonical skeleton at `specs/_template.md` (keep the deeper question guidance in `references/`).
- If the file already exists, show what will change and get approval before overwriting.
- Set `Status: ready-for-implementation` only when nothing material is left open; otherwise use `draft` and list the open items.

Finish with the spec path, a three-line summary of the decisions, and the exact next step: `/implement-me <name>`.

## References

- `specs/_template.md` — canonical skeleton of the spec artifact.
- `references/spec-template.md` — additional structure guidance for the same artifact.
- `references/question-bank.md` — deep questions grouped by dimension.
