# Confirm Account — Token Consumption and First Session

- **Spec:** 003-confirm-account
- **Status:** ready-for-implementation
- **Created:** 2026-11-24
- **Last updated:** 2026-11-24
- **Source:** feature-concept session (delegated by create-spec from the approved authentication breakdown)

## Problem & motivation

`001-sign-up` sends a confirmation email with a tokenized link, but nothing consumes the token. The account stays `pending` forever, and `002-sign-in` correctly refuses to log in a `pending` account with 403. The observable signal that this is fixed: opening the link from the email confirms the account, creates the first session through the JWT/version rule from 002, sends the "A new session was created" email and lands the user on `/app/home`; opening the same link a second time fails with a generic 410.

## Goals / non-goals

- **Goals:**
  - Add `POST /api/v1/auth/confirm-account` accepting the confirmation token in the JSON body, consuming it exactly once.
  - Atomically move the account from `pending` to `active`, mark the token as used and increment `users.session_version` in the same transaction.
  - Issue the 24-hour HS256 JWT using the incremented version, following the session policy established in 002, and send "A new session was created" through `EmailService`.
  - Add the public `/auth/confirm-account?token={TOKEN}` page that reads the query token, posts it automatically, stores the returned JWT and navigates to `/app/home`.
  - Return one generic 410 response for expired, already-used or unknown tokens, without disclosing which case occurred.
  - Compensate a failed notification by restoring account status, token usage and version, then return 502.
  - Document the token-transport and no-resend decisions in the ADR and the affected `.docs/*`.
- **Non-goals:**
  - Credential checking or sign-in itself — owned by `002-sign-in`; this spec only inherits its session creation and email rules.
  - Forgot-password request, reset page and password change — owned by `004-forgot-password` and `005-reset-password`.
  - Enforcing the `/app/*` guard — owned by `006-route-protection`.
  - Resending a lost or expired confirmation email — out of scope for this initiative because neither 001 nor 002 requested it; the 410 message does not promise a self-service resend.
  - Sign-out, session refresh/rotation, OAuth/social login, MFA, email change and rate limiting beyond framework defaults — out of scope for this initiative because they were not requested.
- **Explicitly out of scope:**
  - Generating a new token model or a new database table: the token row and `session_version` column already exist from 001 and 002.
  - shadcn/ui, Playwright E2E and any expert/connector/task/artifact feature from `.docs/BUSINESS.md`.

## Users & jobs to be done

- **New visitor who just signed up:** click the link in the confirmation email, get confirmed and start using the platform without typing credentials again.
- **Developer / reviewer:** follow the email link locally and verify the status change, session, notification and replay behavior with the documented commands.
- **Not served:** returning users (002), users recovering a password (004/005) and operators of protected pages (006).

## Domain model & vocabulary

- **ConfirmationToken:** the opaque token created in 001, stored only as a SHA-256 hash with `expires_at` (24 hours) and nullable `used_at`. It is consumed by this spec and never becomes a session token itself.
- **Account activation:** the one-way transition of `users.status` from `pending` to `active`; compensation can restore it only while handling an email failure inside the same use case.
- **Session:** the JWT/version pair from 002. Every session creation, including one triggered by this link, increments `users.session_version`, so an older token stops validating.
- **Invalid confirmation link:** the single external outcome for an unknown, expired or already-used token; internally these cases are distinguished by the lookup but collapsed into one 410 response.
- **Session notification:** the "A new session was created" `EmailMessage` sent through `EmailService`, identical to the one sent on sign-in.
- Do not conflate ConfirmationToken with the AccessToken returned by this endpoint: the former is single-use and lives in the email link; the latter is a 24-hour Bearer credential stored in `localStorage`.
- All endpoints, routes, claims and UI text remain en-US per `.docs/DEVELOPMENT.md:44`.

## Scope in code

- **[current from 001/002, unchanged]** `users` with `status` and `session_version`; `account_confirmation_tokens` with `token_hash`, `expires_at` and `used_at`; `EmailService` adapters; `AccessToken` policy; global `/api/v1` prefix and `ValidationPipe`; router shell with `/app/home`; no new migration is needed.
- **[target]** `apps/api/src/auth/interface/` — controller for `POST /auth/confirm-account` with a DTO containing `token`, and response mapping identical to the 002 sign-in response.
- **[target]** `apps/api/src/auth/application/` — `ConfirmAccountUseCase` owning the atomic token claim, status transition, version increment, token issue, notification and compensation.
- **[target]** `apps/api/src/auth/domain/` — reuse the `ConfirmationToken` policy from 001 and `AccessToken` policy from 002; no new domain type is introduced.
- **[target]** `apps/api/src/auth/infrastructure/` — Drizzle confirmation-token and account repositories with the conditional update used to claim a token.
- **[target]** `apps/app/src/auth/confirm-account/` — public page reading `token` from the query string, posting it, storing `auth_token` and navigating to `/app/home`, with loading/error states.
- **[target]** `.docs/DEVELOPMENT.md`, `.docs/ARCHITECTURE.md`, `README.md` and `.adrs/` — document the POST-based token transport, the generic 410 policy and the absence of a self-service resend in the same change.
- **[current, unchanged]** `GET /`, the `/` hello-world page, `POST /api/v1/auth/sign-up`, `POST /api/v1/auth/sign-in` and `GET /api/v1/auth/me`.

## Behavior

### Happy path

1. The visitor opens the link from the confirmation email: `http://localhost:5173/auth/confirm-account?token={TOKEN}`.
2. The page shows "Confirming your account…" and sends `POST /api/v1/auth/confirm-account` with `{ "token": "{TOKEN}" }`; a plain GET of the page never consumes the token.
3. The API hashes the token, atomically claims the unconsumed, unexpired row, sets `users.status` to `active` and increments `users.session_version` in one transaction.
4. The API signs a 24-hour HS256 JWT whose `ver` is the newly returned version.
5. The API asks `EmailService` to send "A new session was created" with the UTC time and the text "If this wasn't you, change your password."
6. The API responds HTTP 200 with `{ "accessToken": "{TOKEN}", "tokenType": "Bearer", "expiresIn": 86400 }`.
7. The client stores the token under `localStorage` key `auth_token` and navigates to `/app/home`.
8. Replaying the link returns 410, and any earlier session would be invalidated by the version increment.

### Edge cases & failure modes

- **Empty / single / very large data:** a missing `token` field is rejected with 400 by the global validation pipe. Each account has the single token created in 001; there is no list or pagination. Very large bodies are bounded by framework defaults.
- **Stale / missing / untrusted data:** an expired token (`expires_at` in the past), a used token (`used_at` set), an unknown hash or an already-`active` account with an unused token all produce the same 410 message. No raw token is logged, and the response never reveals which case occurred.
- **Duplicate submit / retries / concurrency / idempotency:** the claim uses `UPDATE ... SET used_at = now() WHERE token_hash = {hash} AND used_at IS NULL AND expires_at > now() RETURNING user_id`, so two simultaneous clicks yield one success and one 410. A retry with the same link is a replay and returns 410 without a second email or version increment. Prefetching by email scanners is harmless because consumption requires a POST.
- **Recoverable vs operator-only failures:** an invalid link is a dead end by design — no self-service resend exists in this initiative, and the 410 message makes no such promise. A failed email adapter restores `status`, `used_at` and `session_version` to their prior values and returns 502, so no confirmed account is left without its session notification. A database error or missing secret is operator-only and surfaces in logs.

### Loading, empty & offline states

- While the POST is in flight the page shows "Confirming your account…" and does not offer a second action.
- On success it navigates immediately to `/app/home` after storing the token; no intermediate success screen is required.
- On 410 it shows "This confirmation link is invalid or has expired." with a link to `/auth/sign-up`; on other failures it shows the generic en-US "Unable to confirm your account. Please try again." with a retry action.
- No empty-list, skeleton or cache state exists: confirmation has no data listing.

## UX & accessibility

- Entry point: the public route `/auth/confirm-account?token={TOKEN}`; successful confirmation navigates to `/app/home`. The guard on `/app/*` is 006's responsibility.
- The loading text, error and retry control are announced with `role="alert"` and are keyboard reachable; DOM order matches visual order.
- The error message is text, never color-only; labels and headings are semantic; visible focus is retained.
- Responsive from mobile to desktop, light theme only, CSS variables from `.docs/DESIGN.md`, no third-party scripts (inherited localStorage mitigation from 002).
- On failure, any previously stored `auth_token` is not overwritten by a new token; the user can still retry sign-in.

## Technical approach

- **Architecture and layer ownership:** extend the `apps/api/src/auth/` slice from 001/002 with a confirmation controller and use case; no new top-level module and no new migration. The client page lives under `apps/app/src/auth/confirm-account/`.
- **Public seam / interface:** `POST /api/v1/auth/confirm-account` with body `{ "token": "..." }` returning 200/400/410/502 with en-US JSON and the 002 response shape on success. The client route is `/auth/confirm-account?token={TOKEN}`; a GET of that route renders the page without consuming the token.
- **Data flow, persistence, and source traceability:** hash the submitted token with SHA-256, claim the `account_confirmation_tokens` row conditionally, update `users.status` and `users.session_version`, then sign the JWT with the returned version. The email is dispatched after the transaction commits; a failure runs a compensating transaction restoring all three changes. The raw token never enters the database or logs.
- **External boundaries and adapters (do not assume a connector exists):** notification goes through `EmailService` (Mailtrap SMTP in non-production, Resend API in production, console fallback). No connector from `.docs/BUSINESS.md` is involved.
- **Security, privacy, and observability:** the token travels in a POST body, not in a URL, API log or Referer; 410 is uniform for all invalid-link cases; the 24-hour token expiry and single-use rule come from 001; the JWT and localStorage mitigations come from 002. No token, password or secret is logged. The ADR records the transport choice and the deliberate absence of resend.
- **Migration, rollout, flag, and rollback:** no new migration, flag or backfill. Rollback reverts the commit; accounts already confirmed by the released code are not automatically returned to `pending`.

## Decisions

- **D-1 — Client page reads the query token and POSTs it in the body:** keeps the link clickable for humans while preventing the raw token from landing in server logs, browser history and Referer headers. Rejected: API GET consuming the token; API redirect carrying the token in a URL. ADR: yes. Verified by: user decision in interview round 1, `specs/001-sign-up.md` D-4.
- **D-2 — One generic 410 for expired, used and unknown tokens, with no resend endpoint:** prevents state disclosure and keeps the approved scope; the message promises no self-service action that does not exist. Rejected: 410 plus a new resend endpoint in 003 (scope change); distinct 400 causes (enumeration). ADR: yes. Verified by: user decision in interview round 1, `specs/001-sign-up.md` D-7.
- **D-3 — Auto-consume the token on page load with loading and error states:** the user already clicked the email link, so an extra confirmation button adds friction. Rejected: explicit "Confirm account" button; redirect without feedback. ADR: no. Verified by: user decision in interview round 1.
- **D-4 — Conditional UPDATE claims the token atomically and the status/version change shares its transaction:** makes replay and concurrent clicks deterministic. Rejected: read-then-write check (race). ADR: no. Verified by: `specs/001-sign-up.md` token table, `specs/002-sign-in.md` version rule.
- **D-5 — Session and notification inherit 002 exactly:** confirmation is a session creation, so it increments the version, returns the same JWT shape and sends "A new session was created". Rejected: silent confirmation without a session or email (contradicts the source prompt). ADR: no. Verified by: source prompt, `specs/002-sign-in.md` D-5 and D-8.
- **D-6 — Compensate a failed email by restoring status, `used_at` and version, then return 502:** mirrors 001 and 002 so no confirmation exists without its notification. Rejected: logging the failure and keeping the account active. ADR: no. Verified by: `specs/001-sign-up.md` D-10, `specs/002-sign-in.md` D-9.
- **D-7 — No new database migration:** 001 created the token table and 002 added `session_version`; this spec only uses them. Rejected: adding a second token table. ADR: no. Verified by: `drizzle/schema.ts` target state in `specs/001-sign-up.md` and `specs/002-sign-in.md`.

## Test strategy & seams

- **HTTP integration seam (Vitest + Supertest against `AppModule`, with repository and `EmailService` fakes):** catches 200, 400, 410 and 502, status/version changes, replay and concurrent claims. Misses real SQL isolation and real SMTP. Source of truth: AC-1, AC-2, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10.
- **Token policy seam (Vitest on the confirmation-token repository/use case):** catches the conditional claim, hashing and single-use behavior. Misses browser query parsing. Source of truth: D-4 and AC-2, AC-5, AC-9.
- **Email seam (capturing `EmailService` fake):** catches exactly one "A new session was created" email per successful confirmation and none on 410/502. Source of truth: AC-4, AC-5, AC-10.
- **Client render seam (Vitest + React Testing Library, jsdom):** catches query-token parsing, automatic POST, loading text, `localStorage` write, navigation and the 410 error state. Misses real email-client prefetch behavior. Source of truth: AC-11, AC-12, AC-13, AC-14.
- **Docs/ADR seam (manual review):** catches a missing record of the transport/no-resend decisions. Source of truth: AC-15.

## Acceptance criteria

- [ ] AC-1 — Given the unused, unexpired token from the 001 email, when `POST /api/v1/auth/confirm-account` receives it in the body, then the API responds HTTP 200 with `{ "accessToken": "{TOKEN}", "tokenType": "Bearer", "expiresIn": 86400 }`.
- [ ] AC-2 — Given a successful confirmation, when the database is inspected, then `users.status` is `active`, the token row has a non-null `used_at` with an unchanged `token_hash`, and `users.session_version` has increased by exactly one.
- [ ] AC-3 — Given the token from AC-1, when it is decoded with `JWT_SECRET`, then the algorithm is HS256, `sub` is the confirmed account's UUID, `ver` equals its new `session_version` and `exp` is 24 hours after `iat`.
- [ ] AC-4 — Given a successful confirmation, when the produced email is inspected, then its subject is "A new session was created", it contains the UTC login time and "If this wasn't you, change your password.", and all user-facing text is en-US.
- [ ] AC-5 — Given the same token is submitted again after AC-1, when `POST /api/v1/auth/confirm-account` is called, then the API responds HTTP 410 with "This confirmation link is invalid or has expired.", and no second session, version increment or email is produced.
- [ ] AC-6 — Given a token whose `expires_at` is in the past, when it is submitted, then the API responds HTTP 410 with the same message and the account remains `pending`.
- [ ] AC-7 — Given an unknown random token, when it is submitted, then the API responds HTTP 410 with the same message and no account changes.
- [ ] AC-8 — Given a request body without `token`, when `POST /api/v1/auth/confirm-account` is called, then the API responds HTTP 400 with en-US validation errors from the global pipe.
- [ ] AC-9 — Given two concurrent submissions of one valid token, when both complete, then exactly one responds 200 and the other 410, `session_version` increases once and exactly one notification email is produced.
- [ ] AC-10 — Given the `EmailService` adapter throws, when a valid token is submitted, then `users.status` returns to `pending`, `used_at` is null again, `session_version` is restored, the API responds HTTP 502 with a generic en-US message and no usable token is returned.
- [ ] AC-11 — Given a browser opens `/auth/confirm-account?token={TOKEN}` with a valid token, when the page loads, then it shows "Confirming your account…", posts the token automatically, stores `auth_token` and navigates to `/app/home`.
- [ ] AC-12 — Given an invalid token in the query string, when the page loads, then it shows "This confirmation link is invalid or has expired." with a link to `/auth/sign-up`, announces the error accessibly and does not store a new token.
- [ ] AC-13 — Given a plain GET of `/auth/confirm-account?token={TOKEN}` with no POST following, when the page is rendered, then the account remains `pending` and the token remains unused.
- [ ] AC-14 — Given an email scanner prefetches links, when it fetches the confirmation URL, then no account is confirmed and no notification email is sent.
- [ ] AC-15 — Given the change is committed, when a reviewer reads `.docs/DEVELOPMENT.md`, `.docs/ARCHITECTURE.md`, `README.md` and `.adrs/`, then the POST-based token transport, the generic 410 policy and the absence of a self-service resend are documented.

## Open questions & assumptions

None — every branch was resolved by an explicit user decision in the interview, an inherited decision from 001/002 or a verified repository fact. Whether a password reset should invalidate existing sessions remains owned by `005-reset-password`.

## Handoff to implement-me

- **Constraints:** do not implement sign-in credentials (002), password recovery (004/005), the `/app/*` guard (006), a resend endpoint, a token table, a new migration, httpOnly cookies, refresh tokens or shadcn/ui. Keep the endpoints and pages from 000/001/002 unchanged.
- **Dependencies to add:** none beyond those already introduced by 001 and 002; reuse `bcrypt`, `class-validator`, `jsonwebtoken`, the Drizzle repositories, `react-router-dom` and the `EmailService` adapters.
- **Temporary behavior:** an expired or used link has no self-service resend in this initiative; the page still links to `/auth/sign-up`, where a duplicate email returns the generic 409 from 001. The 502 compensation is the only rollback path for a failed notification.
- **Follow-ups for later specs:** 004-forgot-password, 005-reset-password (including whether a password reset invalidates `session_version`), 006-route-protection, and the deferred sign-out/refresh/OAuth/MFA items.
- **Manual QA data:** API on 3000, client on 5173, Postgres on 54322. Run `npm run db:migrate`, `npm run test`, `npm run lint`, `npm run check-types` and `npm run build`. Sign up, read the confirmation email in the console fallback or Mailtrap inbox, open the link once and check `/app/home`, the "A new session was created" email and `users.status`; open it again to see the 410, and verify with `GET /api/v1/auth/me` that the confirmation JWT is current.
