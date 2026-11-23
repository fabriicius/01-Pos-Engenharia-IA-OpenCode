# Spec template

Use this structure for `specs/<name>.md`. Keep the headings in order, replace every placeholder, and delete sections that genuinely do not apply (leave a one-line "Not applicable — <reason>" instead of an empty heading). Write in English.

```markdown
# <Feature name>

- **Spec:** <name>
- **Status:** draft | ready-for-implementation
- **Created:** <YYYY-MM-DD>
- **Source:** feature-concept session

## Problem & motivation

What breaks today, for whom, and the signal that will tell us it is fixed.

## Goals / non-goals

- Goals:
- Non-goals:
- Explicitly out of scope:

## Users & jobs to be done

Who triggers this, what they are trying to accomplish, and who is not served.

## Domain model & vocabulary

Concepts and invariants. Use the terms from `.docs/BUSINESS.md` where they apply (source/connector, normalized knowledge, expert, task/request, artifact/output). List new terms and where they belong.

## Scope in code

Workspaces, packages, routes, or modules expected to change. Mark each as [current] or [target] when the repo distinguishes them.

## Behavior

### Happy path

Numbered steps from trigger to observable result.

### Edge cases & failure modes

- Empty / single / very large data:
- Stale / missing / untrusted data:
- Duplicate submit / retries / concurrency / idempotency:
- Recoverable vs operator-only failures:

### Loading, empty & offline states

What the user sees, and how they recover.

## UX & accessibility

Entry point, keyboard path, focus order, labels, error announcements, responsive behavior, and the design tokens/components used. State "Not applicable" with a reason for non-UI work.

## Technical approach

- Architecture and layer ownership:
- Public seam / interface:
- Data flow, persistence, and source traceability:
- External boundaries and adapters (do not assume a connector exists):
- Security, privacy, and observability:
- Migration, rollout, flag, and rollback:

## Decisions

List each settled decision with its rationale, the alternatives rejected, and whether it needs an ADR in `.adrs/*.md`. Record repository facts with the file that verified them.

## Test strategy & seams

For each seam: what the test catches, what it misses, and the layer (unit / integration / E2E). Name the independent source of truth for expected values.

## Acceptance criteria

- [ ] AC-1 — Given <context>, when <action>, then <observable outcome>.
- [ ] AC-2 — Given <context>, when <action>, then <observable outcome> (negative case).

Every criterion must be observable without inspecting implementation details.

## Open questions & assumptions

Empty for `ready-for-implementation`. Otherwise list the item, owner, and what unblocks it.

## Handoff to implement-me

Anything the implementer must know that does not fit above: constraints, temporary behavior, follow-ups, or manual QA data needed.
```
