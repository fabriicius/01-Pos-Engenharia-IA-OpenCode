# Implementation plan — Confirm Account — Token Consumption and First Session

- **Spec:** specs/003-confirm-account.md
- **Status:** proposed
- **Created:** 2026-11-25

## Objective

Opening the link from the sign-up email confirms the account exactly once, creates the first session through the 002 JWT/version rule, sends the "A new session was created" notification and lands the user on `/app/home`. Replay, expiry and unknown tokens produce one generic 410 with no state change; a failed email rolls the confirmation back and returns 502.

## Context loaded

- **AGENTS.md read:** root `AGENTS.md` (Turborepo rules) and `.docs/AGENTS.md`. No nested `AGENTS.md` in touched areas.
- **Context pack read:** `.docs/ARCHITECTURE.md`, `DEVELOPMENT.md`, `QA.md`, `RULES.md`, `DESIGN.md`, `DESIGN_SYSTEM.md`, `BUSINESS.md`.
- **Skills loaded:** `implement-me` (repo-local), `feature-concept` (readiness pass only — spec unchanged: 15 ACs, D-1…D-7 closed, no open questions), `tdd`, `frontend-design`.
- **State verified in code:** 001 and 002 are committed (`e5c81c7`, `40e3e36`) and pushed. `account_confirmation_tokens` has `token_hash`, `expires_at`, `used_at`; `users` has `status` and `session_version`. `ConfirmationTokenRepository` currently has only `create`/`removeByUserId`; `AccountRepository` has `findById`, `incrementSessionVersion`, `setSessionVersionIfVersion`. `SignInUseCase` builds the session-notification text privately. Client has `BrowserRouter`, `apiFetch`, `AUTH_TOKEN_KEY`, and `/`, `/auth/sign-up`, `/auth/sign-in`, `/app/home` routes. No new migration is needed.
- **Not present:** confirmation controller/use case, conditional token claim, activation, `ConfirmAccountPage`, ADR 0004.

## Decisions carried from the spec

- **D-1:** the client reads `token` from the query string and POSTs it in the JSON body; a GET that only renders the page never consumes the token. ADR: yes, `.adrs/0004-confirm-account.md`.
- **D-2:** one generic 410 ("This confirmation link is invalid or has expired.") for unknown, used, expired or already-active-account tokens, with no resend endpoint. ADR: same file.
- **D-3:** auto-consume on page load with "Confirming your account…" and accessible loading/error/retry states; ADR: no.
- **D-4:** conditional `UPDATE ... SET used_at = now() WHERE token_hash = {hash} AND used_at IS NULL AND expires_at > now() RETURNING user_id` inside the same transaction as activation and version increment; ADR: no.
- **D-5/D-6:** session and notification inherit 002 exactly; email failure restores status, `used_at` and version, then returns 502. ADR: no.
- **D-7:** no new migration. ADR: no.
- **Repository facts used:** `drizzle/0001_sign_up.sql` and `0002_sign_in.sql` already provide the required columns; verified in `apps/api/src/auth/infrastructure/schema.ts`.

## Approach

Extend the existing auth slice: add conditional claim/release to `ConfirmationTokenRepository` and conditional activation/deactivation to `AccountRepository`, then let `ConfirmAccountUseCase` do all three writes inside one `UnitOfWork.run` and throw on an invalid token so the transaction rolls back. Extract the notification text from `SignInUseCase` into a shared domain helper so sign-in and confirmation send byte-identical en-US emails without duplicating wording. On the client, a `useRef` guard makes the automatic POST StrictMode-safe, and `apiFetch` supplies the Bearer/401 cleanup behavior already established in 002.

## Work breakdown (vertical slices)

### Slice 1 — Conditional claim and activation ports + Drizzle implementation

- **Files:** `apps/api/src/auth/domain/ports.ts`, `apps/api/src/auth/domain/errors.ts`, `apps/api/src/auth/infrastructure/confirmation-token.repository.ts`, `apps/api/src/auth/infrastructure/account.repository.ts`; update fakes in `apps/api/src/auth/application/sign-up.use-case.spec.ts`, `apps/api/src/auth/application/sign-in.use-case.spec.ts`, `apps/api/test/sign-up.spec.ts`, `apps/api/test/sign-in.spec.ts`.
- **Seam / test:** repository unit tests with a real local Postgres probe (temporary) for claim atomicity; deterministic unit tests for the invalid-token error. Fakes updated without changing existing assertions.
- **Verification:** `npm run test -w api`, `npm run check-types -w api`; temporary real-DB probe for `claim` returning null on used/expired tokens.

### Slice 2 — `ConfirmAccountUseCase`, shared email text and compensation

- **Files:** `apps/api/src/auth/domain/session-email.ts` (new), `apps/api/src/auth/application/sign-in.use-case.ts` (reuse helper), `apps/api/src/auth/application/confirm-account.use-case.ts` + spec.
- **Seam / test:** use-case unit with in-memory transactional fakes: 200 result + status/used_at/version, replay 410, expired 410, unknown 410, already-active 410, concurrent claim one winner, email failure restores all three, JWT claims from returned version.
- **Verification:** `npm run test -w api`.

### Slice 3 — `POST /api/v1/auth/confirm-account` HTTP contract

- **Files:** `apps/api/src/auth/interface/dto/confirm-account-request.dto.ts`, `apps/api/src/auth/interface/confirm-account.controller.ts`, `apps/api/src/auth/auth.module.ts`, `apps/api/test/confirm-account.spec.ts`.
- **Seam / test:** Supertest with fakes for 200 response shape, 400 missing/unknown fields, 410 generic message for all invalid cases, 502 compensation, and no secrets in the body.
- **Verification:** `npm run test -w api`, `npm run check-types -w api`.

### Slice 4 — `/auth/confirm-account?token=…` client page

- **Files:** `apps/app/src/auth/confirm-account/ConfirmAccountPage.tsx` + spec, `apps/app/src/App.tsx` + spec, `apps/app/src/index.css`.
- **Design plan:** reuse 001/002 single-column light layout, linen background, parchment/hairline styling, Georgia heading, powder-blue action, `role="status"` loading and `role="alert"` errors; no new CSS kit, no third-party scripts.
- **Seam / test:** React Testing Library with mocked `fetch`: query-token parsing, automatic POST, "Confirming your account…", `auth_token` write and `/app/home` navigation; 410 error + `/auth/sign-up` link; generic retry; missing token does not POST; a plain render (no POST) leaves the account untouched at the server (HTTP seam already covers that GET never consumes).
- **Verification:** `npm run test -w app`, `npm run build -w app`.

### Slice 5 — Docs and ADR

- **Files:** `.docs/DEVELOPMENT.md`, `.docs/ARCHITECTURE.md`, `.docs/QA.md`, `README.md`, `.adrs/0004-confirm-account.md`.
- **Seam / test:** manual review against AC-15 — POST body transport, generic 410 and the deliberate absence of self-service resend are documented; QA steps include replay and scanner-prefetch behavior.
- **Verification:** `npx prettier --check "**/*.{ts,tsx,md}"`.

### Slice 6 — Full quality gate and delivery

- **Files:** none (verification only).
- **Verification:** `npm run lint`, `npm run check-types`, `npm run test`, `npm run build`, prettier check; `npm run db:migrate` twice (no new migration expected) and a real-DB confirmation probe if infra is up. Commit and push via `/commit-and-push`.

## Dependencies & additions

- No new packages; reuse `jsonwebtoken`, `bcrypt`, `class-validator`, Drizzle, `react-router-dom` and the `EmailService` adapters.
- No new migration: `drizzle/0001_sign_up.sql` and `0002_sign_in.sql` already supply the tables/columns.
- ADR 0004 records D-1, D-2 and the no-resend decision.

## Risks, assumptions & follow-ups

- StrictMode invokes effects twice in development: the client uses a `useRef` guard so the automatic POST runs once; otherwise one click would yield a 200 then a 410.
- Compensation must not clobber a concurrent sign-in: token release is conditional on this claim's `used_at`, status restore on the issued `session_version`, and version restore on the issued version. Covered by unit tests.
- Fakes must emulate transaction rollback on invalid tokens; the in-memory UoW fake snapshots and restores state when `run` throws.
- Never log the raw token; the console email fallback prints only the session notification, not the confirmation token.
- Deliberate deferrals: no resend endpoint (dead-end link by design), no `/app/*` guard (006), no password recovery (004/005), no sign-out/refresh/OAuth/MFA.
- Infra was available during 002; if unavailable now, migration probes are reported as skipped rather than assumed.

## Quality checks (from QA.md)

- [ ] `npm run lint`
- [ ] `npm run check-types`
- [ ] `npm run test`
- [ ] `npm run build` (assert `apps/app/dist/**` exists)
- [ ] `npx prettier --check "**/*.{ts,tsx,md}"`
- [ ] `npm run db:migrate` twice (no new migration expected)

## Manual QA

1. Sign up, read the console-fallback "Confirm your account" email and copy the `{APP_URL}/auth/confirm-account?token={TOKEN}` link.
2. Open the link: page shows "Confirming your account…", then lands on `/app/home` with `localStorage.auth_token` set.
3. Inspect `users.status = active`, token `used_at` non-null with unchanged `token_hash`, and `session_version` incremented once; read the single "A new session was created" email with UTC time and the security sentence.
4. Open the same link again — "This confirmation link is invalid or has expired." with a link to `/auth/sign-up`; no second email and no further version increment.
5. Submit an unknown token and an expired token directly to `POST /api/v1/auth/confirm-account` — the same generic 410; no account changes.
6. Submit a body without `token` — 400 en-US validation errors; confirm a plain GET of the page never consumes a token (scanner prefetch is harmless).
7. Force a notification failure — 502, `status` back to `pending`, `used_at` null, version restored, no usable token.
8. Re-check `GET /`, `/`, sign-up, sign-in and `/auth/me` — earlier contracts still work.

## Rollback

Revert the commit. Accounts already confirmed by the released code are not automatically returned to `pending`; the single-use token rows remain consumed. No migration is added, so no schema rollback is needed.

## Approval

- [ ] Approved by the user — scope as written above.
