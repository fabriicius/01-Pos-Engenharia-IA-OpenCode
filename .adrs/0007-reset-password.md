# ADR 0007 — Reset password: revoke all sessions, uniform invalid links and compensated notification

- **Status:** accepted
- **Date:** 2026-11-26
- **Spec:** `specs/005-reset-password.md`
- **Decisions recorded:** D-1, D-2, D-4, D-7

## Context

`004-forgot-password` already emails a one-hour opaque reset link, but nothing consumes it. `005-reset-password` must turn that link into a single-use password change. A password reset is more sensitive than a confirmation: a user recovering access may be doing so because an attacker holds their credentials or an older JWT. The existing session rule (ADR 0003) binds each HS256 JWT to `users.session_version` and validates it in `GET /api/v1/auth/me`, so incrementing that version during the reset is the established way to revoke prior sessions.

The stack already provides `password_reset_tokens` with hash/expiry/usage columns, bcrypt hashing through `PasswordHasher`, the global `/api/v1` validation pipe, `UnitOfWork` and the `EmailService` port. No new table, migration or dependency is needed. A reset must not issue a JWT, request a link (004), or guard `/app/*` (006).

## Decision

### D-2 — Invalidate every earlier session on a successful reset

- `ResetPasswordUseCase` replaces `users.password_hash` and increments `users.session_version` by exactly one in the same transaction as the token claim. Every JWT signed before the reset then fails `GET /api/v1/auth/me` with 401, including a token stored in the same browser.
- The client clears `auth_token` on success and navigates to `/auth/sign-in`; the user must sign in again with the new password. No replacement JWT is returned by the reset endpoint.
- Rejected: keeping existing sessions (an attacker with an older JWT would retain access), revoking all but the current session (requires current-session tracking outside this spec), and deleting sessions (would add a table and diverge from the version rule).

### D-1 — Token in the POST body with one uniform 410

- `POST /api/v1/auth/reset-password` accepts `{ token, password, confirmPassword }`. The raw token is hashed with the existing SHA-256 helper and never appears in a URL, server log or notification.
- Expired, already-used and unknown tokens all produce the same HTTP 410 with `"This password reset link is invalid or has expired."`. A missing `token` query parameter on the client page shows the same message with a `/auth/forgot-password` link. The 400 validation errors cover only malformed bodies (short password, mismatch, extra fields), because those are user-fixable without disclosing token state.
- Rejected: putting the token in the API path, and distinct statuses/messages for each token failure.

### D-4 — Compensate the notification failure and return 502

- Email dispatch happens after the transaction commits. If `EmailService.send` throws, a second transaction conditionally releases the token claim (`used_at` back to null) and restores the previous `password_hash` and `session_version`; the endpoint returns the generic 502 `"Unable to reset your password. Please try again."` and no success email is produced. The same link can be retried afterwards.
- Rejected: keeping the password change and logging only (silent credential change), automatic send retries (unbounded latency), and returning an email-specific cause to the caller.

### D-7 — No new migration or dependency

- The conditional claim uses `UPDATE ... WHERE token_hash = ... AND used_at IS NULL AND expires_at > now RETURNING`; the guarded account update requires the observed `session_version`. A stale version is treated as an invalid link rather than a partial write. Compensation mirrors these guards, so two concurrent submissions yield one success and one 410.
- The password policy (minimum 8, matching confirmation) is reused from sign-up; verification uses the existing `/auth/me` seam. No migration, table, flag or library is introduced.
- Note the accepted residual risk: a process crash after commit but before dispatch leaves the password changed without a notification. The compensation covers an in-flight adapter throw only, matching 001–004.

## Consequences

- Positive: an attacker holding a pre-reset JWT loses access immediately; a uniform 410 prevents probing token state; a provider failure never leaves a silently changed password.
- Positive: the change is implemented entirely with existing ports and tables, so rollback is a code revert with no schema work.
- Negative: every device is signed out after a reset, including the legitimate one; the sign-in step is intentional and documented for the user.
- Negative: invalid submissions still incur bcrypt cost because hashing happens before the claim, and the compensation cannot cover a crash between commit and send.

## Verification

- Unit tests cover one-time claim, version increment, email text (UTC time, no token link), replay/expired/unknown tokens, concurrency and compensation.
- HTTP Supertest suites cover 200/400/410/502 and a pre-reset JWT receiving 401 on `/auth/me` while a new sign-in token succeeds.
- `npm run lint`, `npm run check-types`, `npm run test`, `npm run build`, `npx prettier --check "**/*.{ts,tsx,md}"` and the optional `RUN_DB_PROBE=1 npm run test -w api` real-SQL probe are the quality gates from `.docs/QA.md`.
