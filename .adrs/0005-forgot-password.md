# ADR 0005 — Uniform reset request, silent cooldown and failure compensation

- **Status:** accepted
- **Date:** 2026-11-25
- **Spec:** `specs/004-forgot-password.md`
- **Decisions recorded:** D-2, D-3, D-6 (plus the implementation adjustments below)

## Context

`001-sign-up` and `003-confirm-account` already establish an `active` account state and an opaque-token convention, but no capability lets a user recover a forgotten password. `004-forgot-password` must accept an email, issue a time-limited reset link for eligible accounts only, and never let a caller distinguish an unknown email from an existing one. That last constraint also applies to throttling and to email-provider failures: a distinct status, body, or delay for any of those cases would reveal whether an account exists.

The existing stack already provides SHA-256 `hashToken()`, `generateOpaqueToken()`, the `EmailService` port and the global `/api/v1` validation prefix, so no new dependency or environment variable is warranted. `005-reset-password` owns token consumption and the password change; this decision covers only the request side.

## Decision

### D-2 — One identical 202 for every well-formed email

- `POST /api/v1/auth/forgot-password` returns HTTP 202 with exactly `{"message":"If an account exists for that email, a password reset link has been sent."}` for an active account, an unknown address, a `pending` account, a cool-down-suppressed repeat and a failed email dispatch.
- `ForgotPasswordUseCase.execute` resolves to `void` in all of those cases; there is no outcome value the controller could branch on. Malformed, empty or extra fields are rejected by the global `ValidationPipe` with 400 before the use case runs. Only an operator-level persistence failure surfaces as the generic Nest 500.
- The public `/auth/forgot-password` page shows the same message and a `/auth/sign-in` link for every accepted address, with no client-side account-state inference.
- Rejected: 404 for unknown emails, distinct 429 for throttled requests, distinct 502 for provider failures, and any body that includes the submitted address.

### D-3 — Silent 60-second cooldown from the newest token

- The cooldown is derived from `created_at` of the newest unconsumed row in the new `password_reset_tokens` table; no separate counter, cache, or store is introduced. A request inside 60 seconds issues nothing and leaves the original row untouched, with no change to the response.
- After the cooldown, the previous unconsumed row is marked used in the same transaction before the new token is inserted. One-hour `expires_at` comes from `PASSWORD_RESET_TOKEN_TTL_MS`; `RESET_COOLDOWN_MS` is defined beside it.
- Rejected: IP-based rate limiting (out of scope, and it would need a new store), a longer cooldown that would slow legitimate recovery, and a different HTTP status for rejected repeats.

### D-6 — Compensate a failed dispatch without disclosing it

- Email dispatch happens after the transaction commits. If `EmailService.send` throws, a second transaction deletes only the newly inserted row, the provider error is logged without the raw token or email, and the endpoint still returns the identical 202. Earlier tokens are deliberately not restored after compensation: they were already invalidated in the committed transaction, and restoring them would need a second, more complex conditional update with no user-visible benefit.
- Rejected: returning 502 on provider failure (state disclosure), retrying the send inside the request (unbounded latency), and leaving an unusable row behind.

### Implementation adjustments (not separate architectural decisions)

- A dedicated `password_reset_tokens` table stores `token_hash`, `expires_at`, nullable `used_at` and `created_at`. It has a unique hash index and a partial unique index on `user_id WHERE used_at IS NULL`, so the one-actionable-link invariant is enforced by Postgres as well as by the use case.
- `AccountRepository.findByEmailForUpdate` performs a `SELECT ... FOR UPDATE` inside `UnitOfWork.run`. That serializes concurrent requests for the same account under `READ COMMITTED`; together with the partial index it guarantees that only one of two simultaneous requests issues a token. The in-memory concurrency test mirrors this with a serialized fake.
- `PasswordResetTokenRepository` is a narrow port with `create`, `findNewestUnconsumedByUserId`, `invalidateUnconsumedByUserId` and `removeById`. The reset email text helper states the one-hour expiry and the "If you didn't request this, you can ignore this email." guidance.
- The opt-in `RUN_DB_PROBE=1` Vitest spec verifies row selection, invalidation, removal, the partial index and the row lock against local Postgres; it is skipped by default.

## Consequences

- Positive: account existence, confirmation state, throttling and provider health are indistinguishable to an unauthenticated caller.
- Positive: one atomic account lock plus a database constraint makes concurrent requests deterministic without a new service.
- Negative: a provider failure leaves an existing account without a usable link while still returning success; the user must issue a new request after the cooldown. This is the accepted cost of anti-enumeration.
- Negative: response timing cannot be literally constant because an eligible request performs extra writes and a send; the guarantee is no branch-specific status, body or deliberate delay.
- Negative: a code rollback leaves the table in place (migrations are forward-only) and any emailed links become unusable.

## Verification

- `npm run test` covers the use-case states and compensation, the identical-202 HTTP contract, validation and the client render seams.
- `RUN_DB_PROBE=1 npm run test -w api` exercises the SQL against local Postgres when Docker/Supabase are running.
- `npm run lint`, `npm run check-types`, `npm run build` and `npx prettier --check "**/*.{ts,tsx,md}"` are the repository quality gates from `.docs/QA.md`.
- Manual QA: submit active, unknown and `pending` addresses, inspect the stored hash/expiry, repeat inside and after the cooldown, force an email failure, and compare the response bodies byte-for-byte.
