# Question bank

Branches to probe during a `feature-concept` session. These are prompts for thinking, not a survey to read aloud. Resolve facts from the repo first, then ask only what remains genuinely undecided. For every question, bring a recommended answer.

## 1. Problem & success

- What breaks today, for whom, and how often?
- What is the smallest change that would make the pain go away?
- How will we know it worked — a metric, an observable behavior, or a user quote?
- What happens today as a workaround, and what does that reveal about the real need?
- Who is explicitly not served by this?

## 2. Scope & boundaries

- Where exactly does this spec start and end?
- Which existing feature could be confused with this one, and how do we tell them apart?
- Is this a new capability, a change to an existing one, or a replacement? What happens to the old path?
- What must keep working unchanged?
- If we had to cut half of this, which half would still be worth shipping?

## 3. Behavior & states

- Walk the happy path from trigger to visible result, one step at a time.
- What happens with zero items, one item, and very large data?
- What happens with stale, missing, or untrusted data?
- Which failures can the user fix themselves, and which need an operator?
- Loading, empty, partial, offline, retry, duplicate-submit, and cancel states?
- If the action runs twice, is that safe? What is the idempotency key?

## 4. Domain & vocabulary

- Which concepts from `.docs/BUSINESS.md` does this touch?
- Does it introduce a new concept? Where does it live and what is its invariant?
- What names will appear in code, routes, and UI text? (en-US per `DEVELOPMENT.md`.)
- Which two similar-sounding terms must not be conflated?

## 5. Data & integrations

- Where does the data come from? Which connector is assumed — and does it actually exist?
- What is stored, what is derived, and what is cached? Who owns each?
- How does an output trace back to the source data it used?
- Retention, deletion, PII, and access ownership?
- What happens when the external source is slow, inconsistent, or unavailable?

## 6. UX & accessibility (UI work)

- Which screen or route owns the interaction, and what is the entry point?
- What is the keyboard path, focus order, and visible focus treatment?
- Are labels, roles, and error announcements correct for assistive tech?
- What changes on tablet and mobile?
- Which components and tokens from `DESIGN_SYSTEM.md` apply?
- Can the user recover from an error without reloading the page?

## 7. Architecture & seams

- Which workspace and layer owns this? Verify current code before using target layering.
- What is the public interface other code will call?
- What stays private? Which adapter crosses an external boundary?
- Where is the transaction or consistency boundary?
- Is this forcing a target architecture that does not exist yet? If so, what is the smaller current-shaped step?
- Which decision would be expensive to reverse later?

## 8. Tests

- Which seams are worth testing? For each, what does it catch and what does it miss?
- Which behavior needs unit coverage, which needs integration, which needs E2E?
- What is the independent source of truth for expected values — a known literal, a worked example, the spec?
- What test would fail if this feature were removed?
- Which test would break on a harmless refactor, and how do we avoid writing it?

## 9. Security, privacy & observability

- Who can trigger this, and who can read the result?
- What input is validated, where, and what is rejected?
- What must be logged, traced, or metered? What must never be logged?
- How will we notice it is broken in production?
- Does any secret or token cross a boundary that should not see it?

## 10. Rollout & operations

- Feature flag, migration, backfill, or dual-write needed?
- What config or environment is required, and who owns it?
- What happens during deploy while old and new code coexist?
- What is the rollback, and what data cannot be rolled back?

## 11. Decisions & ADRs

- Which alternatives were considered, and why were the rejected ones rejected?
- What assumption, if wrong, would invalidate the whole approach?
- Which decision deserves an ADR in `.adrs/*.md` for future readers?

## 12. Acceptance criteria

- Given/When/Then for each behavior, including at least one negative case.
- Can each criterion be verified without inspecting implementation details?
- Who can run the manual QA steps, and what test data or access do they need?
