---
name: refine-spec
description: Refine, tighten, or repair an existing spec in specs/<name>.md by delegating to feature-concept. Use whenever the user asks to refine, improve, review, rewrite, or complete a spec, or says a spec is vague, stale, inconsistent, or missing acceptance criteria. Also accepts a pasted spec or a path to one outside specs/.
argument-hint: "<spec-name | path | pasted spec>"
---

# Refine Spec

Refining a spec means resolving its open decisions, not polishing its prose. `feature-concept` already knows how to walk the decision tree, verify claims against the repository, and write the result to `specs/<name>.md`. This skill resolves the input, captures a baseline, hands off, and validates the improvement.

## 1. Resolve the spec

- If the argument names a spec, accept `name` or `name.md` and read `specs/<name>.md`.
- If no argument is given, list `specs/` (excluding `_template.md`) and ask which one to refine.
- If the argument is a path outside `specs/`, read that file.
- If the user pasted spec content, derive a kebab-case slug from its heading, create `specs/<slug>.md` as a `draft` seeded with that content, and say so. If that file already exists, ask before replacing it.

Never guess which spec the user meant.

## 2. Capture the baseline

Before delegating, note the current `Status`, the number of acceptance criteria, and which sections are empty or still hold placeholders. This makes the final report concrete instead of "it looks better now".

## 3. Hand off to feature-concept

Invoke the `feature-concept` skill on the resolved spec name. Pass the baseline and the user's refinement request as context so it targets the actual weaknesses.

Do not refine the prose yourself. If a section looks wrong, let `feature-concept` decide how to fix it and write the change — it is the single owner of spec decisions and of the write. The canonical skeleton it writes is `specs/_template.md`.

## 4. Validate the result

Check the refined file against `specs/_template.md`:

- every section is present or explicitly marked `Not applicable — <reason>`,
- no `TODO`, `TBD`, or placeholder text remains,
- acceptance criteria use `Given / When / Then` and are observable without reading implementation,
- `Status` matches reality: `ready-for-implementation` only with no open questions, otherwise `draft` with named owners and unblockers,
- only the intended sections changed; unrelated content was preserved.

If a gap remains, call `feature-concept` again with that specific gap.

## 5. Report

Give the user:

1. the spec path and the change in `Status` / acceptance-criteria count,
2. the decisions that were closed and what evidence closed them,
3. anything still open, with owner and unblocker,
4. the exact next step: `/implement-me <name>` — or `refine-spec <name>` again if it is still `draft`.
