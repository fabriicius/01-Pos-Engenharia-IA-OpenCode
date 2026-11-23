# Plan template

Use this structure for `.plans/<spec-file-name>-plan.md`. Replace every placeholder and drop sections that do not apply, leaving a one-line reason. Write in English.

```markdown
# Implementation plan — <spec name>

- **Spec:** specs/<name>.md
- **Status:** proposed | approved | done
- **Created:** <YYYY-MM-DD>

## Objective

One or two sentences: what will be true when this plan is done.

## Context loaded

- **AGENTS.md files read:** <list paths>
- **Context pack read:** <list .docs/* paths>
- **Skills loaded:** <list skill names>
- **Verified in code/config:** <files inspected and what they confirmed>
- **Target items not yet implemented:** <list, or "none">

## Decisions carried from the spec

- <decision> — rationale; ADR: <path or "not needed">
- Repository facts used: <fact> — verified in <file>

## Approach

Short prose describing the shape of the change and why it was chosen.

## Work breakdown (vertical slices)

### Slice 1 — <observable behavior>

- **Files:** <files to create or change>
- **Seam / test:** <public boundary and what the test catches>
- **Verification:** <command or manual step>

### Slice 2 — <observable behavior>

- **Files:**
- **Seam / test:**
- **Verification:**

## Dependencies & additions

Packages, config, migrations, or infra touched, and why each is needed.

## Risks, assumptions & follow-ups

- Risk / assumption: <text> — mitigation or what would invalidate it.
- Deliberate follow-up: <text>.

## ADR candidates

- <decision> — reason it needs an ADR before or during implementation.

## Quality checks (from QA.md)

- [ ] `npm run lint`
- [ ] `npm run check-types`
- [ ] `npm run build`
- [ ] Formatting verified (`npm run format` or a check equivalent)
- [ ] Tests for the slices added/updated and passing

Replace or extend with the checks that actually exist for the touched workspaces. Report unavailable checks instead of inventing them.

## Manual QA

1. <concrete step with expected result>
2. <concrete step with expected result>

## Rollback

How to disable or revert the change, and what cannot be undone.

## Approval

- [ ] Approved by <user> on <date> — scope as written above.
```
