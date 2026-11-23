---
name: create-spec
description: Turn a loose feature request into a refined, implementation-ready spec at specs/[number]-<name>.md by delegating to feature-concept. Use whenever the user asks to create a spec, write a spec, document an idea, capture a requirement, or says "spec this out" — even when they do not name the skill. The artifact is the deliverable; a conversation alone is not.
argument-hint: "<feature idea or spec name>"
---

# Create Spec

A spec is a set of decisions an implementer can execute without guessing. This skill is the entry point for a **new** spec: it derives a stable name, seeds `feature-concept` with the user's prompt, and verifies that the promised artifact actually exists.

`feature-concept` owns the context loading, the decision-tree interview, and the writing. This skill does not duplicate that work — it hands off cleanly and checks the result.

## 1. Derive the spec name

- Read the argument. Accept a name, a slug, or a free-form idea.
- Convert the subject into a short kebab-case slug (for example `user-export`, `supabase-local-infra`).
- State the slug and let the user correct it before delegating.
- Check `specs/`. If `specs/<slug>.md` already exists, do not overwrite it silently: ask whether to refine it instead (hand off to `refine-spec`) or pick a different name.
- If the request is too vague to name, ask one short question. Do not invent a subject.

## 2. Hand off to feature-concept

Invoke the `feature-concept` skill with the slug and the user's original prompt as the seed. Make it explicit that this is a new spec so it starts its decision-tree interview rather than a readiness check.

Pass along:

- the derived slug,
- the user's prompt verbatim — do not paraphrase away constraints,
- any file paths, links, or acceptance signals the user mentioned.

Then step back. Do not run the interview yourself, do not answer its questions on the user's behalf, and do not write the spec file in parallel. Its deeper guidance lives in `.agents/skills/feature-concept/references/`, and the canonical skeleton it writes is `specs/_template.md`.

## 3. Verify the artifact

After `feature-concept` finishes, confirm `specs/<slug>.md` exists and that it:

- follows the structure in `specs/_template.md`, with no unfilled `TODO`, `TBD`, or `<...>` placeholders,
- has acceptance criteria in `Given / When / Then` form,
- carries an honest `Status` — `ready-for-implementation` only when nothing material is open,
- marks inapplicable sections as `Not applicable — <reason>` instead of leaving them empty.

If any of these are missing, call `feature-concept` again with that specific gap instead of patching the file yourself.

## 4. Report

Give the user:

1. the spec path,
2. a three-line summary of the decisions,
3. the acceptance-criteria count and any open questions,
4. the exact next step: `/implement-me <slug>`.
