---
name: breakdown-specs
description: Break one large feature prompt into several numbered, independently implementable specs and delegate each to create-spec. Use whenever a request bundles multiple capabilities — authentication (sign-in, sign-up, confirm-account, forgot-password), a CRUD for products or users, a multi-step workflow — or the user says break this into specs, split the feature, quebrar em specs, dividir em várias specs, or wants one feature implemented at a time, even if they never name the skill. The deliverable is real numbered specs in specs/ plus an ordered execution list, not a breakdown that only lives in chat.
argument-hint: "<large feature prompt or initiative description>"
---

# Breakdown Specs

A big request is rarely one feature. It is a bundle of capabilities that happen to share a noun. This skill decides the seams: which capabilities become separate specs, what each one owns, and which order they must be specified in. The split is the work — the spec content belongs to `create-spec` and `feature-concept`.

A good breakdown passes two tests: each spec can be demoed on its own, and each fits in one `/implement-me` run. If either test fails, resize the slice before writing anything.

Do not confuse decomposition with specification. You resolve questions about _the boundaries between specs_; `feature-concept` resolves questions _inside_ a spec.

## 1. Anchor the initiative

- Read the argument. Accept a free-form prompt, a pasted description, or an initiative name. If it is missing or too thin to split, ask for the full prompt rather than inventing capabilities.
- Keep the prompt verbatim somewhere in the conversation. It is the source text every delegated spec will be seeded with; paraphrasing it early silently drops constraints.
- Match the user's language in the conversation. Specs are written in English per `.docs/DEVELOPMENT.md`.
- Load repository context before proposing any split: `AGENTS.md` from the root down to areas the initiative will touch, then `.docs/AGENTS.md` and the context pack it indexes — `RULES.md`, `ARCHITECTURE.md`, `DEVELOPMENT.md`, `QA.md`, plus `BUSINESS.md` for product work and `DESIGN.md` / `DESIGN_SYSTEM.md` for UI work. Verify claims against code and config; docs may describe a target state that does not exist.
- List `specs/` excluding `_template.md`. Note which capabilities are already specified. If the initiative includes one of them, say so and exclude it from the new split — offer `refine-spec` only if the user wants it revisited.
- Numbering: find the highest numeric prefix in `specs/` (for example `000-foundation.md` → `000`) and start new specs at the next value, zero-padded to three digits (`001-sign-in.md`, `002-sign-up.md`). Pass the **numbered slug** to `create-spec`, not a bare name. Never reuse a number, and never renumber a spec that already exists — later additions simply continue from the highest used number.

## 2. Resolve only split-level ambiguity

Ask only when the answer changes the list, boundaries, or order of specs. Typical cases:

- Email/password vs magic link vs OAuth — each implies different specs and callbacks.
- One spec per resource CRUD vs one spec per operation — a release-cadence decision. Recommend per operation and only bundle when the user says the team ships whole resources at once.
- Whether an admin and an end user are different actors with different capabilities.
- Whether an adjacent capability (resend confirmation, token refresh, sign-out) belongs to this initiative or is deliberately deferred.

Never ask a question the repository can answer; explore and name the file that answered it. Cap this round at the questions that actually change the split. Everything else is an in-spec decision and goes into the relevant seed in step 5.

If the user says "I don't know", do not invent a default to make the table tidy. If the answer changes the table, keep it in the approval round of step 4; otherwise carry it as an open question assigned to the spec that will resolve it.

## 3. Decompose into vertical slices

Work from the prompt's user-visible capabilities, not from its nouns or its technical layers.

- **One demoable capability per spec.** Someone should be able to point at the result and see it work. Authentication splits into sign-up, sign-in, confirm-account, forgot-password, reset-password, sign-out. CRUD is not one capability per resource: create, list with filters, edit, and delete each have their own outcome and their own edge cases, so default to one spec per operation. Bundle a whole resource only when the user explicitly wants coarse delivery or the operations cannot be demoed apart (a single inseparable wizard). A spec that introduces persistence, backend layers, routing, and four operations at once fails the review test below.
- **Slice vertically, not horizontally.** "Database schema", "API endpoints", and "UI screens" are not specs — none can be demoed alone, and each forces the implementer to guess the others. A shared foundation is allowed only when it has an observable seam of its own, such as "session survives a refresh"; "add a users table" is not such a seam.
- **Dependencies point backwards.** A spec may depend only on lower-numbered specs. If spec A needs a decision that spec B will make and B has a higher number, reorder them. If that creates a cycle, merge the two into one spec — the seam was artificial.
- **Every non-goal names an owner.** State what each spec does _not_ do and which numbered spec owns it. This is what stops a `feature-concept` interview from re-opening the entire initiative. Capabilities excluded from the initiative entirely are marked "Out of scope for this initiative — <reason>", also in the sibling specs.
- **Include the boring necessary capabilities.** Sign-out, resend confirmation, refresh, duplicate/empty states, and audit hooks are part of the initiative when the prompt implies them. If the user does not want them, record the exclusion with a reason instead of dropping them silently.
- **Right-size with two tests.** Can it be demoed alone? Does it fit one review? Fail the first → merge into its consumer. Fail the second → split along a capability seam. When genuinely torn, prefer the smaller spec with sharper non-goals: a few extra short interviews cost less than one spec that cannot be delivered independently. If the first slice must lay down persistence, layers, routing, and several operations, it is too large — give the shared conventions to that first narrow slice and let the others inherit them as settled facts.
- **Order by dependency, then by learning.** Put the riskiest foundational slice early so later specs inherit settled decisions rather than re-litigating them. The order the user listed the capabilities is not execution order — justify the first spec by what it unblocks, not by enumeration. Numbers are execution order.

For each slice, prepare these fields — they become both the chat table and the seed for `create-spec`:

- `NNN-slug` and a one-sentence goal with an observable outcome.
- **Depends on:** earlier numbers only, or none.
- **In scope:** the capability and its direct edge cases.
- **Out of scope:** siblings that own the adjacent capabilities.
- **Smoke signal:** how a human sees that this one slice works.
- **Open question:** anything from step 2 assigned here for `feature-concept` to resolve. A question that changes the table itself does not belong to a spec — it belongs in the approval round of step 4 with the requisitioner as owner.

### Example

Input: "Precisamos de autenticação com sign-in, sign-up, confirm account, forget password e sign out."

Breakdown: `001-sign-up` (account created, confirmation pending) → `002-sign-in` (depends on 001) → `003-confirm-account` (depends on 001) → `004-forgot-password` (depends on 002) → `005-reset-password` (depends on 004) → `006-sign-out` (depends on 002). Each spec declares the others as non-goals; token refresh, if needed, becomes `007-session-refresh` rather than a clause hidden inside sign-in.

Input: "CRUD de produtos e usuários, mais importar produtos via CSV."

Breakdown: `001-product-create` (first real feature: table, layers, POST, form) → `002-product-list-filters` → `003-product-edit` → `004-product-delete` → `005-user-create` → `006-user-list-filters` → `007-user-edit` → `008-user-delete` → `009-product-csv-import`. The first spec owns the shared conventions; the rest inherit them. Bundling all four product operations into one spec would fail the review test, so it is not the default.

## 4. Present the breakdown and get approval

Show the split in chat — this is the review artifact, so make it complete enough to correct:

1. Initiative summary and the source prompt quoted verbatim.
2. Context loaded and repository facts that shaped the split, with file names.
3. A table with columns: `#`, `Spec slug`, `Goal / smoke signal`, `Depends on`, `Out of scope owned by`.
4. Execution order and any decisions that are shared by several specs (state them once here; each spec will inherit them).
5. Assumptions and open questions. In-spec questions are labeled with the spec that will resolve them; split-level questions name the requisitioner as owner and are answered here, before the table is approved. Never assign a question to "the breakdown" or "all specs".
6. The exact first spec you will generate.

Then ask for an unambiguous yes, naming that first spec explicitly. This is the cheapest moment to fix a bad seam; after a spec is written, changing its boundary means `refine-spec`. If the user adjusts the split, redraw the table and ask again.

## 5. Delegate one spec at a time

For the next spec in order, invoke `create-spec` with the numbered slug and a self-contained seed containing:

- The original prompt verbatim, including paths, links, and acceptance signals.
- This spec's goal, in scope, out of scope with sibling owners, and smoke signal.
- Dependencies as **settled facts**: quote the decisions from earlier specs that this one must treat as given.
- The open questions assigned to this spec.
- The full approved breakdown table, so `feature-concept` can see the neighboring specs and will not claim their scope.
- An explicit note that this is a **new** spec, so it starts its decision-tree interview rather than a readiness check, and that it writes `specs/<numbered-slug>.md` in English.

Then step back. Do not run the interview, answer its questions on the user's behalf, or write the spec file in parallel. `create-spec` hands off to `feature-concept`, which owns both.

After it finishes:

- Verify `specs/<numbered-slug>.md` exists and follows `specs/_template.md`: every section present or marked `Not applicable — <reason>`, no `TODO` / `TBD` / `<...>` placeholders, acceptance criteria in `AC-n — Given / When / Then` form, honest `Status`, and non-goals that name the sibling specs. If something is missing, call `feature-concept` again (or `refine-spec`) with that specific gap — do not patch the file yourself.
- Report the path, a three-line decision summary, the acceptance-criteria count, and any open questions.
- Record which decisions in this spec now constrain later ones. Re-read the breakdown in chat and update it if the scope of a later spec changed — for example, choosing OAuth may make the password-reset spec obsolete. Never drop a spec silently: say why and ask to remove or replace it. Keep existing numbers stable when a spec is removed.
- **Pause before the next spec.** Ask whether to continue with the next number. If this spec left an open question that blocks a later spec, resolve it with `refine-spec` first instead of moving on.

## 6. Finish

When the agreed specs are written, report in execution order:

1. Every spec path with its goal and `Status`.
2. Decisions summary and acceptance-criteria count per spec.
3. Open questions with owners and what unblocks each one.
4. Any specs removed or merged, with the reason.
5. The next step, one feature at a time: `/implement-me <numbered-slug>` — starting with the first spec, and only after its open questions are closed. `implement-me` handles planning, approval, QA, and `/commit-and-push`.

## References

- `create-spec` — entry point delegated to for each spec.
- `feature-concept` — owner of the interview and of the spec file.
- `refine-spec` — repairs a spec whose gap surfaced after writing.
- `implement-me` — consumer of the numbered specs, one at a time.
- `specs/_template.md` — canonical spec skeleton and definition of ready.
- `.docs/RULES.md` — repository requirements workflow.
