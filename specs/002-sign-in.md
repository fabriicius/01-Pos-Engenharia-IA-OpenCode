# Sign-In — Credentials, Single Active Session and Notification

- **Spec:** 002-sign-in
- **Status:** ready-for-implementation
- **Created:** 2026-11-24
- **Last updated:** 2026-11-24
- **Source:** feature-concept session (delegated by create-spec from the approved authentication breakdown)

## Problem & motivation

Returning visitors cannot log in. `001-sign-up` creates `pending` accounts and a confirmation link, but there is no credential check, no session and no "new session" email. The platform requirement that only one session per person stays valid — the last login wins — is not represented anywhere. The observable signal that this is fixed: a confirmed user signs in at `/auth/sign-in`, receives a JWT and lands on `/app/home`, a "A new session was created" email is sent for every successful sign-in, and signing in a second time makes the first token fail validation while the second succeeds.

This spec owns session creation and validation. `003-confirm-account` inherits the same version-based session rule; `006-route-protection` inherits the validation seam to guard `/app/*`.

## Goals / non-goals

- **Goals:**
  - Add `POST /api/v1/auth/sign-in` accepting `{ email, password }` over the `/api/v1` prefix and validation conventions established in 001.
  - Verify credentials with bcrypt against the stored password hash and reject `pending` accounts with a clear 403.
  - Issue an HS256 JWT with a `ver` claim matched against a new atomic `users.session_version` counter, so the last login invalidates earlier tokens.
  - Add `GET /api/v1/auth/me` as the session-validation seam that accepts a current JWT and rejects stale or expired ones.
  - Send a "A new session was created" email through the `EmailService` port for every successful sign-in, including sessions created later by 003.
  - Add the `/auth/sign-in` client page: store the returned token in `localStorage`, send it as a Bearer header, navigate to `/app/home` on success and clear it on 401.
  - Add `JWT_SECRET` documentation, a migration for `session_version`, and an ADR for the JWT/version and localStorage decisions.
- **Non-goals:**
  - Consuming the confirmation token, confirming an account or creating the first session from a confirmation link — owned by `003-confirm-account`.
  - Forgot-password request, reset page and password change — owned by `004-forgot-password` and `005-reset-password`.
  - Enforcing the `/app/*` guard and redirecting unauthenticated visitors — owned by `006-route-protection`.
  - Sign-out, session refresh/rotation, OAuth/social login, MFA, email change and rate limiting beyond framework defaults — out of scope for this initiative because they were not requested.
- **Explicitly out of scope:**
  - Replacing the JWT/version design with a server-side session table or httpOnly cookie — explicitly rejected by the user in this spec's interview.
  - shadcn/ui, Playwright E2E, production deployment and any expert/connector/task/artifact feature from `.docs/BUSINESS.md`.

## Users & jobs to be done

- **Returning user with a confirmed account:** log in with email and password, reach their private home and be notified that a new session was opened.
- **User who signed in somewhere else:** rely on the last-login-wins rule so an older device no longer authenticates.
- **Developer / reviewer:** validate the credential, session-invalidation and notification contracts with the documented local commands.
- **Not served:** new visitors (001), users with a `pending` account (blocked by design here) and users recovering a password (004/005).

## Domain model & vocabulary

- **Credential pair:** the submitted email and password. Invariant: it is checked against exactly one account by normalized email and bcrypt comparison.
- **Session:** the logical login state of an account. It is not a database row; it is the pair of a signed JWT and the account's current `session_version`.
- **SessionVersion:** an integer on `users`, incremented atomically on every successful sign-in. Invariant: a JWT is valid only when its `ver` claim equals the account's current `session_version`.
- **AccessToken:** an HS256 JWT with claims `sub` (account UUID), `ver`, `iat` and `exp` (24 hours after `iat`), signed with `JWT_SECRET` and transported in the response body and later as `Authorization: Bearer {token}`.
- **Session notification:** an en-US `EmailMessage` sent through the `EmailService` port; provider selection and console fallback are inherited from 001.
- Do not conflate Session with **Account** (001) or with the single-use **ConfirmationToken** (001/003): the confirmation token is consumed once, while the JWT is reusable until it expires or its version becomes stale.
- All identifiers, endpoints, claims and UI text remain en-US per `.docs/DEVELOPMENT.md:44`.

## Scope in code

- **[current from 001, unchanged]** `/api/v1` global prefix, global `ValidationPipe`, `users` with UUID/lowercased unique email/`password_hash`/`status`, `EmailService` adapters, router shell with unguarded `/app/home`, `GET /` hello world, `POST /api/v1/auth/sign-up`.
- **[target]** `apps/api/src/auth/interface/` — `SignInController` with `POST /auth/sign-in` and `GET /auth/me`, `SignInRequestDto` (email, password) and `SignInResponseDto` (`accessToken`, `tokenType: "Bearer"`, `expiresIn: 86400`).
- **[target]** `apps/api/src/auth/application/` — `SignInUseCase` owning credential verification, atomic version increment, token issue, notification and compensation; `GetCurrentSessionUseCase` for `GET /auth/me`.
- **[target]** `apps/api/src/auth/domain/` — `AccessToken` policy (sign/verify and version comparison) and password comparison via bcrypt. Session code stays inside the existing `auth` area; no separate top-level `sessions` module.
- **[target]** `apps/api/src/auth/infrastructure/` — Drizzle account lookup/version repository, `JwtAccessTokenService` using `jsonwebtoken`, and the email adapters inherited from 001.
- **[target]** a Drizzle migration adding `session_version integer not null default 0` to `users`; `drizzle.config.ts` and `npm run db:migrate` remain the migration path.
- **[target]** `apps/api/src/main.ts` — CORS for `http://localhost:5173` allowing the `Authorization` header; no credentialed CORS is needed because the token travels in the body/header.
- **[target]** `apps/app/src/auth/sign-in/` — sign-in form, `localStorage` key `auth_token`, Bearer header helper, navigation to `/app/home` and 401 cleanup; no third-party scripts in the client.
- **[target]** `.env.example`, `.docs/DEVELOPMENT.md`, `.docs/ARCHITECTURE.md`, `README.md` and `.adrs/` — document `JWT_SECRET`, the single-active-session rule, the localStorage risk decision and the `/auth/me` seam in the same change.
- **[current, unchanged]** `packages/*`, `turbo.json`, `docker-compose.yml` and the LGTM stack.

## Behavior

### Happy path

1. A confirmed user opens `http://localhost:5173/auth/sign-in` and enters email and password.
2. The client sends `POST /api/v1/auth/sign-in` with `{ email, password }` while showing a submitting state.
3. The API validates the body, lowercases the email, looks up the account and compares the password with bcrypt.
4. For an `active` account, the API atomically increments `users.session_version` and signs a JWT containing `sub`, the returned `ver`, `iat` and `exp = iat + 24h`.
5. The API asks `EmailService` to send "A new session was created" with the UTC login time and the text "If this wasn't you, change your password."
6. The API responds HTTP 200 with `{ accessToken, tokenType: "Bearer", expiresIn: 86400 }` and no password or raw secret.
7. The client stores `accessToken` under `localStorage` key `auth_token` and navigates to `/app/home`.
8. A later sign-in increments the version again; the earlier token now fails `GET /api/v1/auth/me` with 401 while the new one returns 200. `003-confirm-account` creates its session through the same increment-and-sign rule.

### Edge cases & failure modes

- **Empty / single / very large data:** empty fields and malformed email are rejected with 400 by the class-validator pipe. Only one session version exists per account; there is no session list or pagination. Very large bodies are bounded by framework defaults.
- **Stale / missing / untrusted data:** unknown email and wrong password both return the same generic 401. A stale `ver`, expired `exp`, bad signature or missing Bearer header returns 401 on `GET /auth/me`. A `pending` account with correct credentials returns 403. A missing `JWT_SECRET` is an operator-only startup error, never a silently unsigned token.
- **Duplicate submit / retries / concurrency / idempotency:** the submit button is disabled while in flight. Two concurrent sign-ins perform `UPDATE ... RETURNING session_version` atomically; each token carries the version returned by its own update and only the last committed version validates. Retrying with the same credentials creates a new session and a new notification, as required by "a new session email for each session".
- **Recoverable vs operator-only failures:** a wrong password or a `pending` account is user-fixable. A failed email adapter restores the previous `session_version`, withholds the token and returns 502, so no unnotified session exists. A database or secret misconfiguration is operator-only and surfaces the underlying error in logs, never in the API body.

### Loading, empty & offline states

- While the request is in flight the submit button is disabled and labelled "Signing in…".
- Field errors stay visible after a failed submit so the user can correct them without reloading.
- If the network is unavailable, the form shows the generic en-US "Unable to sign in. Please try again." message.
- No empty-list, skeleton or cache state exists: sign-in has no data listing. A 401 from any API call clears `auth_token` from `localStorage` and leaves the user on the sign-in form.

## UX & accessibility

- Entry point: `/auth/sign-in`; successful submit navigates to `/app/home`. The route guard itself belongs to 006.
- Keyboard path: email → password → submit; DOM order matches visual order; visible focus on every control.
- Persistent labels, `autocomplete="email"` and `autocomplete="current-password"`; errors associated with their fields and announced via `role="alert"`, never by color alone.
- Responsive from mobile to desktop; light theme only; semantic markup; no dark mode.
- Styling uses the CSS variables introduced in 001 from `.docs/DESIGN.md`; no shadcn/ui and no third-party client scripts, per the chosen localStorage mitigation.

## Technical approach

- **Architecture and layer ownership:** extend the `apps/api/src/auth/` vertical slice created in 001 with `interface`, `application`, `domain` and `infrastructure` folders; session code stays inside `auth`, so no separate `sessions` module is introduced. CORS allows the client origin and the `Authorization` header without credentials.
- **Public seam / interface:** `POST /api/v1/auth/sign-in` returning 200/400/401/403/502 with en-US JSON; `GET /api/v1/auth/me` with `Authorization: Bearer {token}` returning 200 with non-sensitive account data or 401. `GET /` and `POST /api/v1/auth/sign-up` from earlier specs remain unchanged.
- **Data flow, persistence, and source traceability:** add `users.session_version integer not null default 0`. On success, `UPDATE users SET session_version = session_version + 1 WHERE id = {id} RETURNING session_version` runs in one transaction; the JWT `ver` comes from that returned value. Verification decodes the JWT with `JWT_SECRET`, compares `ver` to the current database value and checks `exp`. No session table, no refresh token and no connector is involved.
- **External boundaries and adapters (do not assume a connector exists):** the email notification goes through the `EmailService` port from 001 (Mailtrap SMTP in non-production, Resend API in production, console fallback when credentials are absent). `JWT_SECRET` is the only new secret. No Google/Notion/Jira connector is touched.
- **Security, privacy, and observability:** HS256 with 24-hour expiry; no refresh because sign-out/refresh are out of scope. The token is returned in the body and stored in `localStorage` by explicit user decision; accepted mitigations are no third-party scripts, never logging the token, the 24-hour expiry and removal on any 401. Passwords and tokens never appear in logs or error bodies. A 401 is generic to prevent account enumeration; a 403 is returned only when the correct password is supplied for a `pending` account. The localStorage choice and its XSS tradeoff are recorded in an ADR. Application instrumentation remains a later initiative.
- **Migration, rollout, flag, and rollback:** add a Drizzle migration for `session_version`; no flag or backfill. Rollback reverts the commit and migration; tokens issued under the removed column stop validating. The email-failure compensation restores the prior version instead of leaving an unnotified session.

## Decisions

- **D-1 — Represent a session as HS256 JWT plus `users.session_version`, not a session table plus cookie:** user chose token-version invalidation; an atomic counter makes "last login wins" explicit and lets 006 validate without a second store. Rejected: database session row with httpOnly cookie; in-memory map. ADR: yes. Verified by: user decision in interview round 1, empty `apps/api/src/app.module.ts` at the time of the breakdown.
- **D-2 — `session_version` on `users`, `UPDATE ... RETURNING`, 24-hour `exp`, `JWT_SECRET`:** avoids a race where two concurrent logins issue JWTs with the same version. Rejected: separate `auth_sessions` table with 7-day tokens; 1-hour expiry (more re-logins and emails). ADR: yes (same ADR as D-1). Verified by: user decision in interview round 2, `specs/001-sign-up.md` users table.
- **D-3 — Return the token in the body and store it in `localStorage`, sending it as a Bearer header:** explicit user choice over httpOnly cookies; simplifies the SPA flow and CORS. Rejected: httpOnly cookie; server-side 302 redirect. ADR: yes (security tradeoff). Verified by: user decision in interview round 1.
- **D-4 — Mitigate the localStorage risk with no third-party scripts, no token logging, 24-hour expiry and 401 cleanup:** makes the accepted XSS exposure concrete rather than silent. Rejected: cross-tab storage sync now (extra scope); no mitigation. ADR: yes (part of D-3). Verified by: user decision in interview round 2.
- **D-5 — Keep all sign-in and session code inside `apps/api/src/auth/`:** follows the slice created in 001 and avoids a second module for a small surface. Rejected: separate top-level `sessions` module; duplicating conventions in a `sign-in` module. ADR: no. Verified by: `specs/001-sign-up.md` scope in code, user decision in interview round 1.
- **D-6 — `pending` account with correct credentials returns 403 with confirmation guidance:** the user can act on the message, and no session is created before 003. Rejected: generic 401 (unhelpful); allowing login (bypasses the prompt's confirmation flow). ADR: no. Verified by: user decision in interview round 1, `specs/001-sign-up.md` account status.
- **D-7 — Unknown email and wrong password share one generic 401:** prevents account enumeration and keeps the response independent of lookup outcome. Rejected: 404 for unknown email; email alerts on failed login. ADR: no. Verified by: user decision in interview round 1.
- **D-8 — "A new session was created" with UTC login time:** gives the user a concrete activity signal without adding IP/user-agent PII. Rejected: minimal subject-only notice; IP and user-agent details. ADR: no. Verified by: user decision in interview round 1, `EmailService` from 001.
- **D-9 — Compensate a failed notification by restoring the version and returning 502:** mirrors 001 so no session exists without its required email. Rejected: keeping the session and logging only; automatic retries (policy out of scope). ADR: no. Verified by: user decision in interview round 2, `specs/001-sign-up.md` D-10.
- **D-10 — Add `GET /api/v1/auth/me` as the validation seam:** makes "only the last session is valid" observable within this spec and gives 006 a server-side check to reuse. Rejected: no validation endpoint (smoke signal would need 006 first). ADR: no. Verified by: breakdown smoke signal for 002.
- **D-11 — Use `jsonwebtoken` for HS256 signing/verification:** standard Nest-compatible library with a small API for the single algorithm needed. Rejected: JWK/OIDC stack (unnecessary here); hand-rolled HMAC (security risk). ADR: no. Verified by: decision recorded in this session; no JWT library is currently installed in `apps/api/package.json`.

## Test strategy & seams

- **HTTP integration seam (Vitest + Supertest against `AppModule`, with account repository and `EmailService` fakes):** catches 200/400/401/403/502, the response shape, the generic 401 and the `/auth/me` stale-version case. Misses real bcrypt cost at scale and real SMTP. Source of truth: AC-1, AC-5, AC-6, AC-7, AC-8, AC-9, AC-15.
- **Token unit seam (Vitest on `JwtAccessTokenService`):** catches claim contents, HS256 signature, 24-hour expiry, version mismatch and tampering. Misses HTTP header handling. Source of truth: AC-2, AC-3, AC-15.
- **Email seam (capturing `EmailService` fake):** catches one notification per successful sign-in and the en-US subject/body. Misses provider-specific delivery. Source of truth: AC-4.
- **Client render seam (Vitest + React Testing Library, jsdom):** catches the labelled form, submitting state, `localStorage` write, navigation and 401 cleanup. Misses real XSS exposure and browser storage edge cases. Source of truth: AC-11, AC-12, AC-13.
- **Migration seam (manual, `npm run db:migrate` twice):** catches a non-idempotent `session_version` migration; automated tests use fakes and do not require a running database. Source of truth: AC-14.

## Acceptance criteria

- [ ] AC-1 — Given an `active` account with the correct credentials, when `POST /api/v1/auth/sign-in` is called, then the response is HTTP 200 with `{ "accessToken": "{TOKEN}", "tokenType": "Bearer", "expiresIn": 86400 }` and no password, secret or internal error detail.
- [ ] AC-2 — Given the token from AC-1, when it is decoded with `JWT_SECRET`, then the algorithm is HS256, `sub` is the account UUID, `ver` equals the account's incremented `session_version` and `exp` is 24 hours after `iat`.
- [ ] AC-3 — Given two successful sign-ins for the same account, when the second one completes, then `session_version` has been incremented twice, the second token validates at `GET /api/v1/auth/me` and the first token is rejected with 401.
- [ ] AC-4 — Given a successful sign-in, when the produced email is inspected, then its subject is "A new session was created", it contains the UTC login time and the text "If this wasn't you, change your password.", and all user-facing text is en-US.
- [ ] AC-5 — Given a `pending` account and the correct password, when `POST /api/v1/auth/sign-in` is called, then the API returns HTTP 403 with "Please confirm your account before signing in.", no token is issued, no version changes and no email is sent.
- [ ] AC-6 — Given an unknown email, when `POST /api/v1/auth/sign-in` is called, then the API returns HTTP 401 with the same en-US generic message as a wrong-password attempt, no email is sent and `session_version` is unchanged.
- [ ] AC-7 — Given a valid email and a wrong password, when `POST /api/v1/auth/sign-in` is called, then the API returns HTTP 401 with that same generic message and no token is issued.
- [ ] AC-8 — Given empty, malformed or unknown JSON fields, when `POST /api/v1/auth/sign-in` is called, then the API returns HTTP 400 with en-US validation errors from the global pipe.
- [ ] AC-9 — Given the `EmailService` adapter throws, when valid credentials are submitted, then the previous `session_version` is restored, no token is returned, the API responds HTTP 502 with a generic en-US message and no active session remains.
- [ ] AC-10 — Given two concurrent sign-ins for one account, when both complete, then `session_version` has increased by exactly two, each token carries the version returned by its own atomic update and only the token from the last committed update validates at `/auth/me`.
- [ ] AC-11 — Given the browser is on `/auth/sign-in`, when valid credentials are submitted, then the returned token is stored under the `auth_token` localStorage key, the router navigates to `/app/home` and no token appears in the browser or server logs.
- [ ] AC-12 — Given a stored token and any API response with 401, when the client receives that response, then `auth_token` is removed from `localStorage` and the user can submit the sign-in form again.
- [ ] AC-13 — Given `/auth/sign-in` is opened, then it has labelled email and password fields in keyboard order, errors announced with `role="alert"`, en-US text, a responsive light-theme layout and no third-party scripts.
- [ ] AC-14 — Given the migration is applied from a clean checkout, when `npm run db:migrate` is executed twice, then `users.session_version` exists with default 0 on both runs, and `JWT_SECRET`, the session rule and the ADR are documented in `.env.example`, `.docs/*`, `README.md` and `.adrs/`.
- [ ] AC-15 — Given a JWT with an expired `exp`, a stale `ver`, a bad signature or no Bearer header, when `GET /api/v1/auth/me` is called, then the API returns HTTP 401 and no account data is exposed.

## Open questions & assumptions

None — every branch was resolved by an explicit user decision in the two interview rounds, an inherited decision from `001-sign-up` or a verified repository fact. The question of whether a password reset invalidates existing sessions is owned by `005-reset-password` and is deliberately not decided here.

## Handoff to implement-me

- **Constraints:** do not consume the confirmation token or create sessions from confirmation links (003), do not implement password recovery (004/005), and do not guard `/app/*` (006). Keep `GET /`, the `/` hello-world page and the 001 sign-up contract intact. Do not add a session table, httpOnly cookie, refresh token or shadcn/ui.
- **Dependencies to add:** in `apps/api`: `jsonwebtoken` plus `@types/jsonwebtoken`; reuse `bcrypt`, `class-validator`, `class-transformer`, `@nestjs/config` and the email adapters from 001. In `apps/app`: reuse `react-router-dom` from 001. Do not add an OIDC/JWK stack.
- **Environment and configuration:** `JWT_SECRET` must be documented in `.env.example` with a development-only default and a production warning. CORS must allow `http://localhost:5173` and the `Authorization` header; credentialed CORS is not required.
- **Temporary behavior:** the token stays in `localStorage` by explicit decision, with the documented mitigations; `/app/home` remains unguarded until 006; `GET /auth/me` is the validation seam that 006 should reuse; no sign-out exists, so 401 cleanup is the only client-side removal path.
- **Follow-ups for later specs:** 003-confirm-account (session creation from the confirmation token), 004-forgot-password, 005-reset-password (including whether a password reset invalidates the version), 006-route-protection, and the deferred sign-out/refresh/OAuth/MFA items.
- **Manual QA data:** API on 3000, client on 5173, Postgres on 54322. Run `npm run db:migrate`, `npm run test`, `npm run lint`, `npm run check-types` and `npm run build`. Sign in twice from two browser profiles and verify with `GET /api/v1/auth/me` that only the second token works; read both "A new session was created" emails in the console fallback or the configured Mailtrap inbox; check the ADR and the updated docs.
