# Reset Password — Token Consumption and Password Change

- **Spec:** 005-reset-password
- **Status:** ready-for-implementation
- **Created:** 2026-11-24
- **Last updated:** 2026-11-24
- **Source:** feature-concept session (delegated by create-spec from the approved authentication breakdown)

## Problem & motivation

`004-forgot-password` now emails a one-hour tokenized link, but nothing consumes it, so a user who forgot their password cannot regain access. The observable signal that this is fixed: opening the link shows a form for a new password and its confirmation, a mismatch is rejected, a valid submission changes the password hash, sends a "Your password has been reset" email, invalidates previously issued sessions and lands the user on `/auth/sign-in`; reusing the link fails with a generic 410.

## Goals / non-goals

- **Goals:**
  - Add `POST /api/v1/auth/reset-password` accepting `{ token, password, confirmPassword }` with the token in the body, mirroring the transport chosen in 003.
  - Enforce the password rules from 001 (minimum 8 characters, password and confirmation must match) through the global validation pipe.
  - Atomically consume the unconsumed, unexpired reset token, replace `users.password_hash` with a new bcrypt hash and increment `users.session_version` so all older JWTs stop validating.
  - Send an en-US "Your password has been reset" email with the UTC time and no token-bearing link.
  - Return one generic 410 for expired, used or unknown tokens and compensate a failed notification by restoring hash, token usage and version with a 502 response.
  - Add the public `/auth/reset-password?token={TOKEN}` form that clears any stored `auth_token` and navigates to `/auth/sign-in` after success.
  - Document the session-invalidation decision in the ADR and the affected `.docs/*`; no new migration is needed.
- **Non-goals:**
  - Requesting the reset link or applying the 60-second cooldown — owned by `004-forgot-password`.
  - Credential checking and session creation — owned by `002-sign-in`; this spec never issues a JWT.
  - Confirming an account or consuming confirmation tokens — owned by `003-confirm-account`.
  - Enforcing the `/app/*` guard — owned by `006-route-protection`.
  - Sign-out, session refresh/rotation, OAuth/social login, MFA, email change and rate limiting beyond the cooldown in 004 — out of scope for this initiative because they were not requested.
- **Explicitly out of scope:**
  - New token tables, new migrations, shadcn/ui, Playwright E2E and any expert/connector/task/artifact feature from `.docs/BUSINESS.md`.

## Users & jobs to be done

- **User who received the reset email:** set a new password in one form, be told that the change succeeded and sign in again with the new password.
- **Developer / reviewer:** follow the link from 004, check mismatch/short-password errors, successful hash change, notification, session invalidation and replay behavior.
- **Not served:** users who have not requested a reset (004), users signing in normally (002) and unconfirmed users (003).

## Domain model & vocabulary

- **PasswordResetToken:** the opaque token from 004, stored only as a SHA-256 hash in `password_reset_tokens` with `expires_at` (one hour) and `used_at`. It is consumed once by this spec.
- **PasswordChange:** the atomic replacement of `users.password_hash` with a new bcrypt hash; the old hash is retained only in memory for compensation during an email failure.
- **Session invalidation:** incrementing `users.session_version`, the rule established in 002. Invariant: after a successful reset, every JWT issued before the reset fails validation.
- **Reset notification:** the "Your password has been reset" `EmailMessage` sent through `EmailService`; it contains no token or reset link.
- Do not conflate ResetPassword with the 004 request flow or with Account confirmation in 003: the former changes an existing credential, the latter activates a pending account.
- All endpoints, routes and UI strings remain en-US per `.docs/DEVELOPMENT.md:44`.

## Scope in code

- **[current from 001–004, unchanged]** `users` with `password_hash`, `status` and `session_version`; `password_reset_tokens` with hash/expiry/usage; `EmailService` adapters; global `/api/v1` prefix and `ValidationPipe`; public `/auth/*` router shell; uniform 410/502 conventions.
- **[target]** `apps/api/src/auth/interface/` — controller for `POST /auth/reset-password` with a DTO for `token`, `password` and `confirmPassword`, and a fixed en-US response mapping.
- **[target]** `apps/api/src/auth/application/` — `ResetPasswordUseCase` owning the conditional token claim, hash replacement, version increment, notification and compensation.
- **[target]** `apps/api/src/auth/domain/` — reuse the password policy from 001, the reset-token policy from 004 and the session version rule from 002; no new domain type is introduced.
- **[target]** `apps/api/src/auth/infrastructure/` — Drizzle account and reset-token repositories with a conditional update, plus the email adapters from earlier specs.
- **[target]** `apps/app/src/auth/reset-password/` — public form reading `token` from the query string, validating confirmation locally, showing loading/error states, clearing `auth_token` and navigating to `/auth/sign-in`.
- **[target]** `.docs/DEVELOPMENT.md`, `.docs/ARCHITECTURE.md`, `README.md` and `.adrs/` — document that a reset invalidates all existing sessions and the 410/compensation policy, in the same change.
- **[current, unchanged]** `GET /`, `/`, sign-up, sign-in, `GET /auth/me`, confirm-account and forgot-password endpoints and pages.

## Behavior

### Happy path

1. The user opens the link from the 004 email: `http://localhost:5173/auth/reset-password?token={TOKEN}`.
2. The page shows labelled fields for new password and confirmation; the user fills them and submits.
3. The client checks that both values match and sends `POST /api/v1/auth/reset-password` with `{ token, password, confirmPassword }` in the body.
4. The API validates the body, hashes the token, claims the unconsumed, unexpired row, replaces `users.password_hash` with a new bcrypt hash and increments `users.session_version` in one transaction.
5. The API asks `EmailService` to send "Your password has been reset" with the UTC time and "If this wasn't you, reset it again immediately."
6. The API responds HTTP 200 with a short en-US acknowledgement and no token or password.
7. The client removes `auth_token` from `localStorage` and navigates to `/auth/sign-in`; the user signs in with the new password, and any earlier JWT fails `GET /api/v1/auth/me`.

### Edge cases & failure modes

- **Empty / single / very large data:** empty fields, short passwords and mismatched values are rejected with 400 by the global validation pipe. Each account has at most one unconsumed reset token from 004; there is no list or pagination. Very large bodies are bounded by framework defaults.
- **Stale / missing / untrusted data:** an expired, already-used or unknown token produces the same 410 message as 003, with account-specific text "This password reset link is invalid or has expired." No raw token is logged, and the response does not reveal which case occurred.
- **Duplicate submit / retries / concurrency / idempotency:** the client disables the button while in flight. A conditional update claims the token exactly once, so two concurrent submissions yield one success and one 410. A retry with the same link is a replay and returns 410 with no second hash change, version increment or email.
- **Recoverable vs operator-only failures:** mismatch and short password are user-fixable with en-US errors. A failed email adapter restores the previous `password_hash`, clears `used_at`, restores `session_version`, withholds success and returns 502. A database error or missing secret is operator-only and surfaces in logs, never in the response body.

### Loading, empty & offline states

- While the POST is in flight the submit button is disabled and labelled "Resetting password…".
- Field errors and token errors stay visible after a failed submit so the user can react without reloading.
- If the network is unavailable, the form shows the generic en-US "Unable to reset your password. Please try again." message.
- No empty-list or cache state exists: the reset form has no data listing.

## UX & accessibility

- Entry point: public `/auth/reset-password?token={TOKEN}`; success navigates to `/auth/sign-in`. The guard on `/app/*` belongs to 006.
- Keyboard path: new password → confirm password → submit → sign-in link; visible focus on every control; DOM order matches visual order.
- Persistent labels, `autocomplete="new-password"`, a visible minimum-8 hint, and errors announced with `role="alert"` and paired with text/icons, never color alone.
- On a 410 the page shows the generic link-error message and a link to `/auth/forgot-password`; it never exposes which token case failed.
- Responsive from mobile to desktop, light theme only, CSS variables from `.docs/DESIGN.md`, no third-party scripts and no shadcn/ui.

## Technical approach

- **Architecture and layer ownership:** extend the `apps/api/src/auth/` slice with a reset-password controller and use case, using the `interface`/`application`/`domain`/`infrastructure` layering from 001/002. No new top-level module and no new migration.
- **Public seam / interface:** `POST /api/v1/auth/reset-password` with `{ token, password, confirmPassword }` returning 200/400/410/502 with en-US JSON. No JWT is returned; the client route is `/auth/reset-password?token={TOKEN}`.
- **Data flow, persistence, and source traceability:** hash the submitted token, claim it conditionally, update `password_hash` and `session_version` in one transaction, then send the notification. The old hash and prior version are kept in memory for compensation if the email fails. The raw token never enters the database or logs.
- **External boundaries and adapters (do not assume a connector exists):** notification uses the `EmailService` port (Mailtrap SMTP in non-production, Resend API in production, console fallback). No connector from `.docs/BUSINESS.md` is involved.
- **Security, privacy, and observability:** passwords are bcrypt-hashed with minimum length 8 and confirmation matching; plaintext passwords and raw tokens are never logged or returned. Incrementing `session_version` after a reset revokes all earlier sessions, including one stored in the same browser; the ADR records this security-first tradeoff. The uniform 410 prevents token-state disclosure. Application instrumentation remains a later initiative.
- **Migration, rollout, flag, and rollback:** no new migration, flag or backfill. Rollback reverts the commit; password hashes changed by the released code are not automatically restored, so the compensating transaction is the only automatic reversal.

## Decisions

- **D-1 — Token in the POST body with a uniform 410 for invalid links:** mirrors 003 and keeps the raw token out of server logs and Referer headers. Rejected: token in the API URL; distinct 400 causes. ADR: no. Verified by: `specs/003-confirm-account.md` D-1/D-2, user decision in interview round 1.
- **D-2 — Invalidate all existing sessions by incrementing `session_version`:** a password change must stop an attacker holding an older JWT, and the rule already exists in 002. Rejected: keeping sessions (security risk); revoking all but the current one (needs current-session tracking outside this spec). ADR: yes. Verified by: user decision in interview round 1, `specs/002-sign-in.md` D-1/D-2.
- **D-3 — Success email "Your password has been reset" with UTC time and no token link:** confirms the change without creating a second actionable credential. Rejected: minimal notice; IP/user-agent details (PII). ADR: no. Verified by: user decision in interview round 1.
- **D-4 — Compensate hash, `used_at` and version on email failure, then return 502:** mirrors 001–003 so a password change is never silent. Rejected: keeping the change and logging only; automatic retries. ADR: no. Verified by: user decision in interview round 1, `specs/004-forgot-password.md` failure policy.
- **D-5 — Reuse the minimum-8/match password policy from 001:** one rule across sign-up and reset avoids divergent validation. Rejected: different length for reset; complexity requirements. ADR: no. Verified by: `specs/001-sign-up.md` D-6.
- **D-6 — Client clears `auth_token` on success:** after D-2 the stored JWT is stale by definition; leaving it would cause a confusing 401 on the next call. Rejected: keeping it until 006 handles it. ADR: no. Verified by: `specs/002-sign-in.md` localStorage key and 401 cleanup.
- **D-7 — No new migration or dependency:** all tables, hashing, validation and email capabilities exist from earlier specs. Rejected: a new sessions/reset table or a token library. ADR: no. Verified by: `drizzle/schema.ts` target state in 001/004.

## Test strategy & seams

- **HTTP integration seam (Vitest + Supertest against `AppModule`, with account/reset-token repositories and `EmailService` fakes):** catches 200/400/410/502, hash change, token usage, version increment and compensation. Misses real bcrypt cost and SMTP. Source of truth: AC-1, AC-2, AC-4, AC-5, AC-6, AC-7, AC-8, AC-10.
- **Session invalidation seam (Vitest on `/auth/me` with a pre-reset JWT):** catches that the version increment actually rejects older tokens. Misses browser storage behavior. Source of truth: AC-9.
- **Email seam (capturing `EmailService` fake):** catches one success notification with the right subject/body and none on 410/502. Source of truth: AC-3, AC-7, AC-10.
- **Client render seam (Vitest + React Testing Library, jsdom):** catches the two labelled fields, local mismatch check, error states, `auth_token` removal and navigation. Misses real XSS exposure. Source of truth: AC-11, AC-12.
- **Docs/ADR seam (manual review):** catches a missing record of the session-invalidation decision. Source of truth: AC-13.

## Acceptance criteria

- [ ] AC-1 — Given an unconsumed, unexpired token from the 004 email, when `POST /api/v1/auth/reset-password` receives it in the body with matching passwords of at least 8 characters, then the API responds HTTP 200 with a short en-US acknowledgement containing no token or password.
- [ ] AC-2 — Given a successful reset, when the database is inspected, then `users.password_hash` verifies the new password and not the old one, the token row has a non-null `used_at` with unchanged hash, and `users.session_version` has increased by exactly one.
- [ ] AC-3 — Given a successful reset, when the produced email is inspected, then its subject is "Your password has been reset", it contains the UTC time and "If this wasn't you, reset it again immediately.", it has no token-bearing link, and all user-facing text is en-US.
- [ ] AC-4 — Given `password` and `confirmPassword` differ, when the request is made, then the API responds HTTP 400 with an en-US mismatch error and no hash, token or version changes.
- [ ] AC-5 — Given a password shorter than 8 characters, when the request is made, then the API responds HTTP 400 and no changes are made.
- [ ] AC-6 — Given an expired token, when the request is made, then the API responds HTTP 410 with "This password reset link is invalid or has expired." and no changes are made.
- [ ] AC-7 — Given the same token is submitted again after AC-1, when the request is repeated, then the API responds HTTP 410 with that same message and no second hash change, version increment or email.
- [ ] AC-8 — Given an unknown random token, when the request is made, then the API responds HTTP 410 with the same message and no account changes.
- [ ] AC-9 — Given a JWT issued before a successful reset, when `GET /api/v1/auth/me` is called with it afterwards, then the API responds HTTP 401 and no account data is exposed.
- [ ] AC-10 — Given the `EmailService` adapter throws, when a valid token and passwords are submitted, then the previous `password_hash` is restored, `used_at` is null again, `session_version` is restored, the API responds HTTP 502 with a generic en-US message and no success email is produced.
- [ ] AC-11 — Given a browser opens `/auth/reset-password?token={TOKEN}`, then it shows labelled new-password and confirmation fields with a minimum-8 hint, keyboard order, visible focus, `role="alert"` errors, en-US text and a responsive light-theme layout.
- [ ] AC-12 — Given a valid submission in the browser, when the response is 200, then `auth_token` is removed from `localStorage` and the router navigates to `/auth/sign-in`.
- [ ] AC-13 — Given the change is committed, when a reviewer inspects logs, the database and `.docs/*`/`.adrs/`, then the raw token and plaintext password appear nowhere, and the session-invalidation and 410/502 policies are documented with an ADR.

## Open questions & assumptions

None — every branch was resolved by an explicit user decision in the interview or by inherited facts from 001–004. The breakdown's open question about whether a reset invalidates sessions is closed by D-2.

## Handoff to implement-me

- **Constraints:** do not implement the reset request or cooldown (004), sign-in credentials (002), confirmation (003) or the `/app/*` guard (006). Do not issue a JWT, add a new migration/table, add a token library, use shadcn/ui or add Playwright. Keep all endpoints and pages from 000–004 unchanged.
- **Dependencies to add:** none beyond those introduced by 001–004; reuse `bcrypt`, `class-validator`, the Drizzle repositories, `jsonwebtoken` for validation in `GET /auth/me`, `react-router-dom` and `EmailService`.
- **Temporary behavior:** after a reset the user has no session until they sign in again; `/auth/sign-in` is the intended next step. A failed success notification rolls back the entire change, so the user can retry the same link.
- **Follow-ups for later specs:** 006-route-protection, plus the deferred sign-out/refresh/OAuth/MFA items. Resending a confirmation link remains outside the initiative.
- **Manual QA data:** API on 3000, client on 5173, Postgres on 54322. Run `npm run db:migrate`, `npm run test`, `npm run lint`, `npm run check-types` and `npm run build`. Request a reset with 004, open the link, submit a mismatch and then a valid pair, read the "Your password has been reset" email in the console fallback or Mailtrap inbox, sign in with the new password, verify an old JWT fails `GET /api/v1/auth/me`, and replay the link to see the 410.
