<!--
Spec template — copy this file to specs/<name>.md and replace every placeholder.

Definition of ready:
  1. Every heading below is present. To drop one, write `Not applicable — <reason>` in its place.
  2. No TODO / TBD / placeholder text remains.
  3. Acceptance criteria follow `AC-n — Given ... when ... then ...` and are observable without reading implementation.
  4. Status is `ready-for-implementation` only when no material decision is open; otherwise `draft` with open items and owners.

Write in English. Treat code/config as the source of truth and label target-state items [target] and current items [current].
This is the canonical skeleton used by feature-concept, create-spec and refine-spec. Deeper question guidance lives in .agents/skills/feature-concept/references/.
-->

# <Feature name>

- **Spec:** <kebab-case-name>
- **Status:** draft | ready-for-implementation
- **Created:** <YYYY-MM-DD>
- **Last updated:** <YYYY-MM-DD>
- **Source:** <feature-concept session | prompt | issue/ADR link>

## Problem & motivation

<!-- What breaks today, for whom, and the observable signal that tells us it is fixed. Do not propose the solution here. -->

<One short paragraph.>

## Goals / non-goals

- **Goals:**
  - <...>
- **Non-goals:**
  - <...>
- **Explicitly out of scope:**
  - <...>

## Users & jobs to be done

<!-- Who triggers this, what they are trying to accomplish, and who is not served. -->

- <...>

## Domain model & vocabulary

<!-- Concepts and invariants. Reuse terms from .docs/BUSINESS.md; list new terms and where they belong. -->

- <...>

## Scope in code

<!-- Workspaces, packages, routes, or modules expected to change. Mark [current] or [target]. -->

- <...>

## Behavior

### Happy path

1. <trigger>
2. <observable step>
3. <observable result>

### Edge cases & failure modes

- **Empty / single / very large data:** <...>
- **Stale / missing / untrusted data:** <...>
- **Duplicate submit / retries / concurrency / idempotency:** <...>
- **Recoverable vs operator-only failures:** <...>

### Loading, empty & offline states

<!-- What the user sees and how they recover. Use "Not applicable — <reason>" for non-UI work. -->

<...>

## UX & accessibility

<!-- Entry point, keyboard path, focus order, labels, error announcements, responsiveness, tokens/components. -->

<...>

## Technical approach

- **Architecture and layer ownership:** <...>
- **Public seam / interface:** <...>
- **Data flow, persistence, and source traceability:** <...>
- **External boundaries and adapters:** <...> (do not assume a connector exists)
- **Security, privacy, and observability:** <...>
- **Migration, rollout, flag, and rollback:** <...>

## Decisions

<!-- One entry per settled decision: rationale, rejected alternatives, ADR needed?, verifying file. -->

- **D-1 — <decision>:** <rationale>. Rejected: <...>. ADR: <yes/no>. Verified by: <file>.

## Test strategy & seams

<!-- For each seam: what the test catches, what it misses, and the layer. Name the independent source of truth. -->

- <...>

## Acceptance criteria

- [ ] AC-1 — Given <context>, when <action>, then <observable outcome>.
- [ ] AC-2 — Given <context>, when <action>, then <observable outcome> (negative case).

## Open questions & assumptions

<!-- Empty for ready-for-implementation. Otherwise: item, owner, what unblocks it. -->

- <...>

## Handoff to implement-me

<!-- Constraints, temporary behavior, follow-ups, manual QA data the implementer needs. -->

<...>
