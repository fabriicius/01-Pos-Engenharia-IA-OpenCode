# Implementation plan — Confirm Account — Token Consumption and First Session

- **Spec:** specs/003-confirm-account.md
- **Status:** approved
- **Created:** 2026-11-25

## Objective

Opening the confirmation link from the sign-up email consumes the token exactly once, activates the account, creates the first session through the 002 JWT/version rule, sends the "A new session was created" notification and lands the user on `/app/home`; replay, expiry and unknown tokens return one generic 410 with no state change, and a failed notification rolls the confirmation back to 502.

## Context loaded

- **AGENTS.md files read:** root `AGENTS.md` (Turborepo rules — no Turborepo config/command changes are planned) and `.docs/AGENTS.md`. `find apps packages drizzle .adrs -name AGENTS.md` found no nested files in touched areas.
- **Context pack read:** `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/RULES.md`, `.docs/QA.md`, `.docs/BUSINESS.md`, `.docs/DESIGN.md`, `.docs/DESIGN_SYSTEM.md`.
- **Skills loaded:** `implement-me` and its `references/plan-template.md` (repo-local); `feature-concept` readiness pass only — spec unchanged: 15 ACs, D-1…D-7 closed, no open questions; `tdd` (seams: HTTP, token policy, email, client render); `frontend-design` (light-theme, token-driven UI). `shadcn` and Playwright are deliberately not used: the spec excludes shadcn/ui and E2E; `next-best-practices`/`vercel-react-best-practices` do not apply because the client is React + Vite, not Next.js.
- **Verified in code/config:**
  - `package.json` and `turbo.json`: real root commands are `npm run lint`, `npm run check-types`, `npm run test`, `npm run build`, `npm run infra:up`, `npm run db:migrate`; workspace filters such as `npm run test -w api` work (README:86).
  - `apps/api/src/auth/infrastructure/schema.ts` and `drizzle/0001_sign_up.sql`, `drizzle/0002_sign_in.sql`: `account_confirmation_tokens.token_hash/expires_at/used_at` and `users.status/session_version` already exist — no migration is needed.
  - `apps/api/src/auth/domain/ports.ts`: `ConfirmationTokenRepository` has only `create`/`removeByUserId`; `AccountRepository` has `findById`, `incrementSessionVersion`, `setSessionVersionIfVersion`. `UnitOfWork.run` gives transactional repositories; `DrizzleUnitOfWork` wraps each `run` in `database.db.transaction`.
  - `apps/api/src/auth/domain/tokens.ts`: `hashToken` is SHA-256 hex and `CONFIRMATION_TOKEN_TTL_MS` is 24 hours; `apps/api/src/auth/domain/access-token.ts`: TTL 86400 and `{sub, ver, iat, exp}` claims.
  - `apps/api/src/auth/application/sign-in.use-case.ts` and `sign-up.use-case.ts`: sign-in owns the session notification text and conditional version rollback; sign-up owns the 24-hour link and email-failure compensation pattern to mirror.
  - `apps/api/src/setup.ts` and `sign-in.controller.ts`: global `/api/v1` prefix, `ValidationPipe({whitelist, forbidNonWhitelisted, transform})`, and error-to-HTTP mapping in the controller; no global exception filter exists.
  - `apps/app/src/App.tsx` has routes `/`, `/auth/sign-up`, `/auth/sign-in`, `/app/home`; `auth/api-client.ts` exports `apiFetch`, `AUTH_TOKEN_KEY`, `setAuthToken`, `extractErrorMessage`; `main.tsx` uses `StrictMode` (so an auto-POST effect needs a one-shot guard); `index.css` already defines the palette and form/error styles.
  - Existing test patterns: `apps/api/test/sign-in.spec.ts` (Supertest against `AppModule` with in-memory ports), `apps/api/src/auth/application/sign-in.use-case.spec.ts` (capturing email fake), `apps/app/src/auth/sign-in/SignInPage.test.tsx` (React Testing Library + stubbed `fetch`), `apps/app/src/App.test.tsx`.
  - `README.md` and `.docs/QA.md` still say the confirmation link is deferred to 003; `.adrs/` currently ends at `0003-sessions.md`.
- **Target items not yet implemented:** confirmation controller/DTO/use case, conditional token claim/release, conditional activation/restore, `ConfirmAccountPage`, ADR 0004, and confirmation QA/docs.

## Decisions carried from the spec

- **D-1 — client-side query token, API body token** — keeps the email link clickable without putting the raw token in API logs or Referer; ADR: yes, `.adrs/0004-confirm-account.md`. Verified: sign-up's `confirmationEmailText` already emits `{APP_URL}/auth/confirm-account?token={TOKEN}`.
- **D-2 — one generic 410 for expired/used/unknown/already-active tokens, no resend endpoint** — avoids state disclosure and respects scope; ADR: same file. Verified by `specs/001-sign-up.md` D-7 and the spec's non-goals.
- **D-3 — auto-consume on page load with loading/error/retry states** — the click is already the user's intent; ADR: no.
- **D-4 — conditional `UPDATE ... SET used_at = now() WHERE token_hash = {hash} AND used_at IS NULL AND expires_at > now() RETURNING ...` in the same transaction as activation and version increment** — deterministic replay/concurrency; ADR: no. Verified: `DrizzleUnitOfWork` provides one transaction for all repository calls inside `run`.
- **D-5 — session and notification inherit 002 exactly** — HS256 24-hour JWT with the incremented `ver`, same response shape and email text; ADR: no. Verified: `SignInUseCase` lines 55–81 and ADR 0003.
- **D-6 — failed email restores status, `used_at` and version, then 502** — no confirmation without notification; ADR: no. Verified: sign-in compensates with a version-conditional update (ADR 0003 implementation adjustments).
- **D-7 — no new migration** — ADR: no.
- Repository facts used: `ACCESS_TOKEN_TTL_SECONDS = 86400` in `domain/access-token.ts`; global validation in `setup.ts`; `StrictMode` in `apps/app/src/main.tsx`.

## Approach

Extend the existing `apps/api/src/auth/` slice rather than adding a module. Add two narrow ports: a conditional token claim/release pair on `ConfirmationTokenRepository` and a conditional activate/deactivate pair on `AccountRepository`. `ConfirmAccountUseCase` performs the claim, activation and version increment inside a single `UnitOfWork.run`; invalid tokens throw `InvalidConfirmationTokenError` so the transaction rolls the claim back. It then signs with the returned version and calls `EmailService` outside the transaction, mirroring 002; on failure a second conditional transaction restores all three writes before throwing `SessionNotificationError`. Extract sign-in's private email text into a shared helper so both flows send byte-identical en-US notifications. On the client, add a public `ConfirmAccountPage` that reads `token` from `useSearchParams`, POSTs once (guarded against StrictMode's double effect), stores `auth_token` and navigates to `/app/home`, with accessible loading/410/retry states. Keep the existing routes, endpoints and CSS conventions; update docs/ADR in the same change.

## Work breakdown (vertical slices)

### Slice 1 — Conditional token claim and account activation ports + Drizzle implementations

- **Files:** `apps/api/src/auth/domain/ports.ts`, `apps/api/src/auth/domain/errors.ts` (add `InvalidConfirmationTokenError` with the canonical 410 message), `apps/api/src/auth/infrastructure/confirmation-token.repository.ts`, `apps/api/src/auth/infrastructure/account.repository.ts`; update abstract-method fakes in `apps/api/src/auth/application/sign-up.use-case.spec.ts`, `apps/api/src/auth/application/sign-in.use-case.spec.ts`, `apps/api/test/sign-up.spec.ts`, `apps/api/test/sign-in.spec.ts` without changing their assertions.
- **Seam / test:** repository behavior through the ports — `claimByHash` returns `{userId, usedAt}` only for an unexpired, unused hash and null for used/expired/unknown; `activateIfPending` refuses an already-active account; release/restore only apply to the exact claimed version/used-at. Unit tests use in-memory fakes; an optional real-Postgres probe is run only if infra is available, never assumed.
- **Verification:** `npm run test -w api`, `npm run check-types -w api`.

### Slice 2 — `ConfirmAccountUseCase`, shared session email, compensation

- **Files:** `apps/api/src/auth/domain/session-email.ts` (new shared en-US text helper), `apps/api/src/auth/application/sign-in.use-case.ts` (reuse helper, no wording change), `apps/api/src/auth/application/confirm-account.use-case.ts` + `confirm-account.use-case.spec.ts`.
- **Seam / test:** use-case unit with in-memory transactional fakes and capturing email/JWT fakes: 200 result plus status/used_at/version; JWT signed with the returned version; replay, expired, unknown and already-active all throw the same error; concurrent claims yield one winner; email failure restores status, `used_at` and version and changes nothing else.
- **Verification:** `npm run test -w api`, `npm run check-types -w api`.

### Slice 3 — `POST /api/v1/auth/confirm-account` HTTP contract

- **Files:** `apps/api/src/auth/interface/dto/confirm-account-request.dto.ts` (new, `@IsString()` + `@IsNotEmpty()`), `apps/api/src/auth/interface/confirm-account.controller.ts` (new, maps `InvalidConfirmationTokenError` → `GoneException` with "This confirmation link is invalid or has expired.", `SessionNotificationError` → `BadGatewayException("Unable to confirm your account. Please try again.")`), `apps/api/src/auth/auth.module.ts`, `apps/api/test/confirm-account.spec.ts` (Supertest against `AppModule` with fakes, as in `sign-in.spec.ts`).
- **Seam / test:** HTTP boundary — 200 body shape `{accessToken, tokenType: "Bearer", expiresIn: 86400}`, 400 for missing/extra/unknown fields from the global pipe, uniform 410 for all invalid tokens, 502 on email failure, and no raw token or secret in responses/logs.
- **Verification:** `npm run test -w api`, `npm run check-types -w api`, `npm run lint -w api`.

### Slice 4 — `/auth/confirm-account?token={TOKEN}` client page

- **Files:** `apps/app/src/auth/confirm-account/ConfirmAccountPage.tsx` + `ConfirmAccountPage.test.tsx` (new), `apps/app/src/App.tsx` + `apps/app/src/App.test.tsx`, `apps/app/src/index.css`.
- **Design plan:** reuse the 001/002 single-column light layout (`--linen`/`--parchment` surface, hairline heading rule, Georgia heading, powder-blue action); no new kit, no shadcn, no third-party scripts. Loading uses `role="status"` with "Confirming your account…"; 410 shows `role="alert"` text plus a link to `/auth/sign-up`; other failures show the generic en-US retry message. DOM order matches visual order; focus remains visible.
- **Seam / test:** React Testing Library with stubbed `fetch` — query token parsed and POSTed once (including a StrictMode double-render check), loading state, `localStorage.auth_token` write and `/app/home` navigation, 410 error + sign-up link with no new token stored, generic retry, missing token makes no POST, and a plain render never triggers a server consumption (the API seam proves GET does not consume).
- **Verification:** `npm run test -w app`, `npm run build -w app`, `npm run check-types -w app`.

### Slice 5 — Docs and ADR

- **Files:** `.adrs/0004-confirm-account.md` (new: D-1, D-2 and no-resend decision; rejected alternatives), `.docs/DEVELOPMENT.md`, `.docs/ARCHITECTURE.md`, `.docs/QA.md`, `README.md`.
- **Seam / test:** manual review against AC-15 — POST-body transport, generic 410/no-resend policy, confirmation QA steps (replay, scanner prefetch, forced email failure) and updated endpoint/route lists are present; remove stale "deferred to 003" wording.
- **Verification:** `npx prettier --check "**/*.{ts,tsx,md}"`.

### Slice 6 — Full quality gate

- **Files:** none (verification only; no commit or push in this planning phase).
- **Verification:** `npm run lint`, `npm run check-types`, `npm run test`, `npm run build` (assert `apps/app/dist/**` exists), `npx prettier --check "**/*.{ts,tsx,md}"`; `npm run infra:up` then `npm run db:migrate` twice only if Docker/Supabase are available (no new migration expected), otherwise report skipped.

## Dependencies & additions

- No new packages: reuse `jsonwebtoken`, `class-validator`, Drizzle, `react-router-dom` and the existing `EmailService` adapters.
- No new migration or schema change: `drizzle/0001_sign_up.sql` and `drizzle/0002_sign_in.sql` already provide the tables/columns.
- ADR 0004 is the only new non-source artifact; it records the token transport and no-resend decisions.

## Risks, assumptions & follow-ups

- StrictMode double-invokes effects: a `useRef` one-shot guard is required or one click would produce 200 then 410. A client test covers it.
- Compensation must not clobber concurrent writes: release only the claimed `used_at`, deactivate only while `status = active` and version equals the issued version, and restore the version only from the issued version — the same conditional-update discipline as ADR 0003.
- In-memory fakes do not prove real SQL row locking; AC-9 is verified deterministically with fakes, with a real-DB probe as optional extra. If infra is unavailable, report the probe as skipped rather than claiming it passed.
- "Already-active account with an unused token" must also be 410 and must roll back the claim; covered in Slice 2.
- Raw token never logged; the console email fallback prints only the sign-up link/session email. 410 wording must not promise a resend that does not exist.
- Deliberate deferrals: no resend endpoint, no `/app/*` guard (006), no password recovery (004/005), no sign-out/refresh/OAuth/MFA, no E2E or shadcn.
- Commit/push remains with the parent orchestrator; this plan explicitly stops at the approval gate.

## ADR candidates

- **D-1 token transport (query on the public page, POST body to the API, no GET consumption)** — architectural boundary and security-relevant; ADR 0004.
- **D-2 single generic 410 and deliberate absence of self-service resend** — externally visible policy and scope decision; ADR 0004.

## Quality checks (from QA.md)

- [ ] `npm run lint`
- [ ] `npm run check-types`
- [ ] `npm run test`
- [ ] `npm run build` (assert `apps/app/dist/**` exists)
- [ ] `npx prettier --check "**/*.{ts,tsx,md}"`
- [ ] `npm run db:migrate` twice after `npm run infra:up` (skip and report if Docker/Supabase unavailable)

## Manual QA

1. With API on 3000, client on 5173 and Postgres on 54322 (`npm run infra:up`, `npm run db:migrate`, `npm run dev`), sign up and read the console-fallback or Mailtrap "Confirm your account" email; copy the `{APP_URL}/auth/confirm-account?token={TOKEN}` link.
2. Open the link: "Confirming your account…" appears, then the browser lands on `/app/home` with `localStorage.auth_token` set; `GET /api/v1/auth/me` with that token returns 200.
3. Inspect the database: `users.status = active`, token `used_at` non-null with unchanged `token_hash`, `session_version` incremented by exactly one; exactly one "A new session was created" email with UTC time and "If this wasn't you, change your password."
4. Open the same link again: "This confirmation link is invalid or has expired." with a link to `/auth/sign-up`; no second email and no further version increment.
5. POST an unknown token and a token whose `expires_at` is in the past: the same generic 410 with no account changes; POST a body without `token`: 400 en-US validation errors.
6. Fetch the page URL without following the POST (simulate scanner prefetch): account stays `pending`, token stays unused and no notification is sent.
7. Force `EmailService` to throw: 502, `status` back to `pending`, `used_at` null, version restored, no usable token returned.
8. Re-check `GET /`, `/`, sign-up, sign-in and `/auth/me` — earlier contracts still work.

## Rollback

Revert the commit. Accounts already confirmed by the released version are not automatically returned to `pending`; consumed token rows stay consumed and issued JWTs keep their version. No migration exists, so there is no schema rollback.

## Approval

- [x] Approved by the user on 2026-11-25 — scope as written above.
