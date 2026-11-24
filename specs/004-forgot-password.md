# Forgot Password — Reset Request and Tokenized Email

- **Spec:** 004-forgot-password
- **Status:** ready-for-implementation
- **Created:** 2026-11-24
- **Last updated:** 2026-11-24
- **Source:** feature-concept session (delegated by create-spec from the approved authentication breakdown)

## Problem & motivation

A user who forgot their password has no way to start recovery. Earlier specs create accounts, sessions and confirmation links, but no endpoint accepts a password-reset request and no reset token exists. The observable signal that this is fixed: submitting an email at `/auth/forgot-password` always returns the same en-US 202 message, and only when an `active` account exists does a "Reset your password" email arrive with a one-hour tokenized link to `/auth/reset-password?token={TOKEN}` — without revealing whether the email was registered.

## Goals / non-goals

- **Goals:**
  - Add `POST /api/v1/auth/forgot-password` with `{ email }` and a uniform 202 response for every well-formed email.
  - For an `active` account only, create a `password_reset_tokens` row with a hashed opaque token, one-hour expiry and nullable `used_at`, invalidating earlier reset tokens for that account.
  - Send an en-US "Reset your password" email through `EmailService` containing the tokenized link, the one-hour expiry notice and an "ignore this email" note.
  - Apply a silent 60-second per-email cooldown that suppresses duplicate emails without changing the response.
  - Treat unknown emails and `pending` accounts exactly like successful requests from the outside: same status, same body, no email.
  - Compensate a failed email dispatch by removing the token, logging the error and still returning the identical 202 response.
  - Add the public `/auth/forgot-password` client page and document the anti-enumeration and cooldown decisions.
- **Non-goals:**
  - Consuming the reset token, rendering the reset page, validating a new password or changing the password hash — owned by `005-reset-password`.
  - Credential checking and the session/version policy — owned by `002-sign-in`; this spec never creates a session.
  - Confirming an account or resending confirmation links — owned by `003-confirm-account`, and resend is out of the initiative.
  - Enforcing the `/app/*` guard — owned by `006-route-protection`.
  - Sign-out, session refresh/rotation, OAuth/social login, MFA, email change and rate limiting beyond the 60-second cooldown — out of scope for this initiative because they were not requested.
- **Explicitly out of scope:**
  - IP-based rate limiting infrastructure, shadcn/ui, Playwright E2E and any expert/connector/task/artifact feature from `.docs/BUSINESS.md`.

## Users & jobs to be done

- **User who forgot their password:** request a reset link without disclosing to anyone whether their email is registered.
- **Developer / reviewer:** verify that the response is identical for existing, unknown and `pending` emails while only the `active` case produces an email.
- **Not served:** users ready to set a new password (005), returning users signing in normally (002) and unconfirmed users (003).

## Domain model & vocabulary

- **PasswordResetRequest:** the submitted email address; it is normalized to lowercase before lookup and never echoed back in the response.
- **PasswordResetToken:** an opaque `crypto.randomBytes(32).toString("base64url")` value stored only as a SHA-256 hash in `password_reset_tokens` with `expires_at` (one hour), `used_at` (nullable) and `created_at`. Invariant: at most one unconsumed token per account; a new request after the cooldown invalidates older ones.
- **Cooldown:** a 60-second window measured from the newest unconsumed token's `created_at`; a request inside the window is acknowledged but produces no new token and no email.
- **Uniform response:** the single 202 body used for all well-formed requests, independent of account existence, status or email-delivery outcome.
- Do not conflate PasswordResetToken with the single-use **ConfirmationToken** from 001/003 or with the 24-hour **AccessToken** from 002: each has its own table, expiry and consumer.
- All endpoints, routes and UI strings remain en-US per `.docs/DEVELOPMENT.md:44`.

## Scope in code

- **[current from 001–003, unchanged]** `users` with UUID, lowercased unique email, `password_hash`, `status` and `session_version`; `account_confirmation_tokens`; `EmailService` adapters; global `/api/v1` prefix and `ValidationPipe`; public `/auth/*` router shell; generic 409/410 conventions.
- **[target]** `drizzle/schema.ts` — new `password_reset_tokens` table and a new migration after the 002 migration; no changes to `users` or `account_confirmation_tokens`.
- **[target]** `apps/api/src/auth/interface/` — controller for `POST /auth/forgot-password` with a DTO containing `email` and a fixed response mapping.
- **[target]** `apps/api/src/auth/application/` — `ForgotPasswordUseCase` owning lookup, cooldown, token issue, invalidation of older tokens, email dispatch and compensation.
- **[target]** `apps/api/src/auth/domain/` — reusable opaque-token/hash policy aligned with 001; no new domain type beyond `PasswordResetToken`.
- **[target]** `apps/api/src/auth/infrastructure/` — Drizzle account lookup and password-reset-token repository with the conditional insert/invalidation query.
- **[target]** `apps/app/src/auth/forgot-password/` — public page with an email field, submitting state and the generic success message plus a link to `/auth/sign-in`.
- **[target]** `.docs/DEVELOPMENT.md`, `.docs/ARCHITECTURE.md`, `README.md` and `.adrs/` — document the new table, the anti-enumeration response, the cooldown and the compensation policy in the same change.
- **[current, unchanged]** `GET /`, `/`, `POST /api/v1/auth/sign-up`, `POST /api/v1/auth/sign-in`, `GET /api/v1/auth/me` and `POST /api/v1/auth/confirm-account`.

## Behavior

### Happy path

1. A user opens `http://localhost:5173/auth/forgot-password` and enters their email.
2. The client sends `POST /api/v1/auth/forgot-password` with `{ "email": "..." }` while showing a submitting state.
3. The API validates the format, lowercases the email and looks up the account.
4. For an `active` account with no token created in the last 60 seconds, the API invalidates older unconsumed tokens and inserts a new row with a hashed token expiring in one hour.
5. The API asks `EmailService` to send "Reset your password" with a link to `{APP_URL}/auth/reset-password?token={TOKEN}`, the one-hour expiry notice and the ignore note.
6. The API responds HTTP 202 with "If an account exists for that email, a password reset link has been sent." for every well-formed request, regardless of the lookup outcome.
7. The page shows that same message and a link to `/auth/sign-in`; no route or response distinguishes a registered email.

### Edge cases & failure modes

- **Empty / single / very large data:** an empty or malformed email is rejected with 400 by the global validation pipe; this reveals only format, not account existence. At most one unconsumed reset token exists per account; there is no list or pagination. Very large bodies are bounded by framework defaults.
- **Stale / missing / untrusted data:** an unknown email, a `pending` account and an `active` account all return the identical 202 body. Expired or consumed tokens are ignored here and handled as invalid by 005. A missing `APP_URL` falls back to `http://localhost:5173`.
- **Duplicate submit / retries / concurrency / idempotency:** a request inside the 60-second cooldown returns 202 without a new token or email. Two concurrent requests are serialized by the repository's conditional check/insert so at most one token is issued; a second successful request after the cooldown invalidates the earlier token. The UI disables the button while in flight.
- **Recoverable vs operator-only failures:** a wrong-format email is user-fixable with an en-US error. A failed `EmailService` adapter removes the new token, logs the underlying error and returns the same 202, so the failure never discloses account existence. A database error is operator-only and surfaces in logs with a generic 500 body that is also independent of account existence.

### Loading, empty & offline states

- While the POST is in flight the submit button is disabled and labelled "Sending link…".
- The success message stays visible after submit; field errors remain after a failed format validation.
- If the network is unavailable, the form shows the generic en-US "Unable to send the link. Please try again." message.
- No empty-list or cache state exists: the request has no data listing.

## UX & accessibility

- Entry point: public `/auth/forgot-password`; success keeps the user on the page with the generic message and a keyboard-reachable link to `/auth/sign-in`.
- Keyboard path: email field → submit → sign-in link; visible focus on every control; DOM order matches visual order.
- Persistent label, `type="email"`, `autocomplete="email"`, errors announced with `role="alert"` and never signalled by color alone.
- Responsive from mobile to desktop, light theme only, CSS variables from `.docs/DESIGN.md`, no shadcn/ui and no third-party scripts (inherited from 002).
- The page must not display different text for existing, unknown or `pending` emails.

## Technical approach

- **Architecture and layer ownership:** extend the `apps/api/src/auth/` slice with a forgot-password controller and use case, following the `interface`/`application`/`domain`/`infrastructure` layering from 001/002. No new top-level module.
- **Public seam / interface:** `POST /api/v1/auth/forgot-password` with `{ "email": "..." }` returning 202 (uniform), 400 (format) or a generic 500 for operator failures; the email carries `{APP_URL}/auth/reset-password?token={TOKEN}` for 005 to consume.
- **Data flow, persistence, and source traceability:** normalize the email, look up an `active` account, check the newest unconsumed token's `created_at` for the cooldown, invalidate older tokens, insert the hashed token with a one-hour `expires_at`, then send the email. Token hashes never leave the infrastructure layer; the raw token exists only in the email link. No product connector or source traceability is involved.
- **External boundaries and adapters (do not assume a connector exists):** notifications use the `EmailService` port (Mailtrap SMTP in non-production, Resend API in production, console fallback when credentials are absent). No Google/Notion/Jira connector is touched.
- **Security, privacy, and observability:** uniform 202, identical body and no timing-visible branch in the response prevent account enumeration; no email address is echoed back. The token is high-entropy, hashed at rest and short-lived. Provider errors are logged with correlation context but never include the raw token or the submitted email in a response. The ADR records the anti-enumeration and cooldown decisions.
- **Migration, rollout, flag, and rollback:** add a Drizzle migration for `password_reset_tokens`; no flag or backfill. Rollback reverts the commit and migration; tokens already sent become unusable after rollback. The cooldown is derived from existing rows, so no separate cache is added.

## Decisions

- **D-1 — Own `password_reset_tokens` table with a one-hour hashed token:** keeps reset semantics separate from account confirmation and shortens the exposure window. Rejected: reusing `account_confirmation_tokens`; stateless JWT reset tokens (revocation needs state). ADR: no. Verified by: `specs/001-sign-up.md` token model, user decision in interview round 1.
- **D-2 — Uniform HTTP 202 body for every well-formed email:** prevents account enumeration while keeping a truthful "if an account exists" statement. Rejected: 200 (less precise for an asynchronous effect); 404 for unknown email (enumeration). ADR: yes. Verified by: user decision in interview round 1.
- **D-3 — Silent 60-second cooldown derived from token `created_at`:** stops repeated email sends without a new store or a different response. Rejected: no throttling (spam vector); IP rate limiting (infrastructure outside scope). ADR: yes (same ADR as D-2). Verified by: user decision in interview round 1.
- **D-4 — New valid requests invalidate earlier unconsumed tokens:** one actionable link per account avoids ambiguity about which link 005 should accept. Rejected: multiple simultaneous valid tokens. ADR: no. Verified by: user decision in interview round 1.
- **D-5 — `pending` accounts are treated like unknown emails:** recovery must not bypass or confuse the confirmation flow in 003. Rejected: sending a reset link to `pending` accounts; returning 403 (leaks existence). ADR: no. Verified by: user decision in interview round 1, `specs/003-confirm-account.md` status transition.
- **D-6 — On email failure, remove the token, log the error and keep the 202 response:** a different status would reveal that the email exists. Rejected: 502 only for existing accounts; keeping an undelivered token. ADR: yes (part of D-2). Verified by: user decision in interview round 2, `specs/003-confirm-account.md` compensation pattern.
- **D-7 — Route `/auth/forgot-password` with the generic success message:** familiar en-US wording and a clear next step without revealing state. Rejected: `/auth/forget-password`; `/auth/reset-request`. ADR: no. Verified by: user decision in interview round 2.
- **D-8 — No new dependencies:** the token/hash and email capabilities already exist from earlier specs. Rejected: adding a rate-limit or queue library. ADR: no. Verified by: `apps/api/package.json`, `apps/app/package.json` as updated by 001–003.

## Test strategy & seams

- **HTTP integration seam (Vitest + Supertest against `AppModule`, with account repository, reset-token repository and `EmailService` fakes):** catches the uniform 202, suppression for unknown/`pending` emails, 400 format errors, cooldown and failure compensation. Misses real SQL timing and SMTP. Source of truth: AC-1, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8.
- **Token seam (Vitest on reset-token repository/use case):** catches hashing, one-hour expiry, invalidation of older tokens and single unconsumed token per account. Misses browser query parsing (005). Source of truth: AC-2, AC-6, AC-9.
- **Email seam (capturing `EmailService` fake):** catches exactly one reset email for an eligible account, correct link/content and none in suppressed cases. Source of truth: AC-1, AC-3, AC-4, AC-5, AC-12.
- **Client render seam (Vitest + React Testing Library, jsdom):** catches the email field, submitting state, identical generic message and sign-in link. Source of truth: AC-10, AC-11.
- **Migration seam (manual, `npm run db:migrate` twice):** catches a non-idempotent `password_reset_tokens` migration. Source of truth: AC-13.

## Acceptance criteria

- [ ] AC-1 — Given an `active` account, when `POST /api/v1/auth/forgot-password` receives its email, then the API responds HTTP 202 with "If an account exists for that email, a password reset link has been sent." and a "Reset your password" email is produced.
- [ ] AC-2 — Given that email, when the database is inspected, then `password_reset_tokens` has a row with a hash of the token, `expires_at` about one hour after creation, `used_at` null and no raw token stored, and any earlier unconsumed token for that account is invalidated.
- [ ] AC-3 — Given an unknown email, when the request is made, then the response status and body are identical to AC-1, no token row is created and no email is produced.
- [ ] AC-4 — Given a `pending` account, when its email is submitted, then the response is identical to AC-1 and no token or email is produced.
- [ ] AC-5 — Given a token created less than 60 seconds ago, when the same email is submitted again, then the response is identical to AC-1, no new token or email is produced and the original token remains unconsumed.
- [ ] AC-6 — Given the last token is older than 60 seconds, when the email is submitted again, then a new hashed token and email are produced and the previous unconsumed token is invalidated.
- [ ] AC-7 — Given an empty or malformed email, when the request is made, then the API responds HTTP 400 with en-US validation errors and no token or email is produced.
- [ ] AC-8 — Given the `EmailService` adapter throws for an existing account, when the request is made, then the new token is removed, the error is logged and the API still responds with the identical 202 body.
- [ ] AC-9 — Given the raw token from the email, when application logs and the database are inspected, then neither contains it in plain text.
- [ ] AC-10 — Given a browser opens `/auth/forgot-password`, then it shows one labelled email field, keyboard-reachable controls, visible focus, `role="alert"` errors, en-US text and a responsive light-theme layout.
- [ ] AC-11 — Given a well-formed email is submitted in the browser, when the request completes, then the button shows a submitting state, the page shows the generic message from AC-1 and a link to `/auth/sign-in`, with no different outcome for any email address.
- [ ] AC-12 — Given the reset email is inspected, then its subject is "Reset your password", its body links to `{APP_URL}/auth/reset-password?token={TOKEN}`, states the one-hour expiry and says "If you didn't request this, you can ignore this email.", all in en-US.
- [ ] AC-13 — Given a clean checkout and `npm run db:migrate` executed twice, then `password_reset_tokens` exists with the documented columns on both runs, and the anti-enumeration response, cooldown and environment variables are documented in `.docs/*`, `README.md` and the ADR.

## Open questions & assumptions

None — every branch was resolved by an explicit user decision in the two interview rounds or by inherited facts from 001–003. Whether a successful password reset should invalidate the account's sessions is owned by `005-reset-password`.

## Handoff to implement-me

- **Constraints:** do not consume the reset token, render `/auth/reset-password`, validate a new password or change the password hash (005). Do not create a session, enforce the `/app/*` guard or add IP rate limiting, shadcn/ui, Playwright or a new external library. Keep the endpoints and pages from 000–003 unchanged.
- **Dependencies to add:** none beyond those introduced by 001–003; reuse `class-validator`, the Drizzle setup, `EmailService` and `react-router-dom`.
- **Temporary behavior:** the uniform 202 means an existing account can end a request without an email if the provider fails; that is an accepted tradeoff to prevent enumeration. The cooldown is silent — no "wait" message is shown.
- **Follow-ups for later specs:** 005-reset-password (token consumption, password change, success email and session invalidation decision), 006-route-protection, and the deferred sign-out/refresh/OAuth/MFA items.
- **Manual QA data:** API on 3000, client on 5173, Postgres on 54322. Run `npm run db:migrate`, `npm run test`, `npm run lint`, `npm run check-types` and `npm run build`. Submit an existing email, a `pending` email and an unknown email and compare the 202 bodies; read only the first email in the console fallback or Mailtrap inbox; repeat inside 60 seconds to confirm no second email; inspect `password_reset_tokens` to confirm hash-only storage and the one-hour expiry.
