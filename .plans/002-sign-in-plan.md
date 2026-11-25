# Implementation plan — Sign-In — Credentials, Single Active Session and Notification

- **Spec:** specs/002-sign-in.md
- **Status:** completed
- **Created:** 2026-11-24

## Objective

A confirmed user can sign in at `/auth/sign-in`, receive an HS256 JWT bound to an atomically incremented `users.session_version`, get a "A new session was created" email, and land on `/app/home`. A second sign-in invalidates the first token at `GET /api/v1/auth/me`. Existing 001 contracts (`GET /`, `/`, sign-up) stay intact.

## Context loaded

- **AGENTS.md read:** root `AGENTS.md` (Turborepo rules) and `.docs/AGENTS.md`. No nested `AGENTS.md` in touched areas.
- **Context pack read:** `.docs/ARCHITECTURE.md`, `DEVELOPMENT.md`, `QA.md`, `RULES.md`, `DESIGN.md`, `DESIGN_SYSTEM.md`, `BUSINESS.md`.
- **Skills loaded:** `implement-me`, `feature-concept` (readiness check only — spec unchanged, D-1…D-11 closed, 15 ACs, no open questions), `tdd`, `frontend-design` (design direction carried from 001).
- **State verified in code:** 001 is committed as `e5c81c7` and pushed. `auth` slice has `interface/application/domain/infrastructure`; `EmailService`, `UnitOfWork` and `PasswordHasher` ports exist; `users` table is in `apps/api/src/auth/infrastructure/schema.ts` re-exported by `drizzle/schema.ts`; migration journal ends at `0001_sign_up`. `configureApp()` sets the `/api/v1` prefix with a root-GET exclusion, the validation pipe and CORS for `http://localhost:5173`. Client has `BrowserRouter` with `/`, `/auth/sign-up`, `/app/home`; CSS tokens are in `apps/app/src/index.css`. Local Postgres is up and `npm run db:migrate` is idempotent.
- **Not present:** `jsonwebtoken`, `@types/jsonwebtoken`, `session_version`, sign-in DTOs/use cases, `/auth/me`, sign-in page, Bearer helper, ADR 0003.

## Decisions carried from the spec

- **D-1/D-2:** JWT+`session_version`, atomic `UPDATE ... RETURNING`, 24h expiry, `JWT_SECRET`; no session table or cookie. ADR: yes, `.adrs/0003-sessions.md`.
- **D-3/D-4:** token in body and `localStorage` (`auth_token`), Bearer header, no third-party scripts, no token logging, 24h expiry, 401 cleanup. ADR: same file (security tradeoff).
- **D-5:** everything stays inside `apps/api/src/auth/`; no new top-level module.
- **D-6/D-7:** correct password on a `pending` account → 403 with confirmation guidance; unknown email and wrong password share one generic 401.
- **D-8:** subject "A new session was created", UTC login time, "If this wasn't you, change your password."
- **D-9:** email failure restores the previous version, withholds the token, returns 502.
- **D-10:** `GET /api/v1/auth/me` is the validation seam reused by 006.
- **D-11:** `jsonwebtoken` for HS256.
- **Pre-agreed test seams:** HTTP integration (Supertest + DI spies on real providers), token unit (`JwtAccessTokenService`), use-case unit (in-memory ports), client render (React Testing Library + mocked `fetch`/`localStorage`), migration (manual, twice), docs/ADR (manual). No other seams.

## Approach

Extend the existing auth slice rather than adding a module. Add a `SessionRepository` port on top of the current `UnitOfWork` so credential lookup, atomic increment and conditional version restore happen inside one transaction, and application code stays free of Drizzle. `PasswordHasher` gains `compare`. A new `AccessTokenService` port is implemented by `JwtAccessTokenService` using `jsonwebtoken`; both sign-in and `/auth/me` depend on it. A Nest guard validates the Bearer token and current version before `/auth/me` reaches the controller. On the client, `SignInPage` posts credentials, stores the token, and an `apiFetch` helper adds the Bearer header and clears the token on any 401. Design reuses 001's palette and form patterns; no new CSS kit.

## Work breakdown (vertical slices)

### Slice 1 — Session schema, token service and 200 response

- **Files:** `apps/api/package.json`; `drizzle/schema.ts`, `apps/api/src/auth/infrastructure/schema.ts`, generated `drizzle/0002_sign_in.sql` + snapshot + journal; `apps/api/src/auth/domain/tokens.ts` (or new `access-token.ts`), `apps/api/src/auth/infrastructure/jwt-access-token.service.ts`, `apps/api/src/auth/interface/dto/sign-in-request.dto.ts`, `sign-in-response.dto.ts`, `apps/api/src/auth/interface/sign-in.controller.ts`, `apps/api/src/auth/application/sign-in.use-case.ts`, `auth.module.ts`, `setup.ts` (CORS `allowedHeaders`).
- **Seam / test first:** token unit spec asserts HS256, `sub`, `ver`, `exp - iat = 86400`, rejection of tampered/expired/stale tokens. HTTP spec asserts 200 shape and no secrets with use-case and port fakes.
- **Verification:** `npm run test -w api`, `npm run check-types -w api`.

### Slice 2 — Credentials, pending/401 matrix and atomic version

- **Files:** extend `domain/ports.ts` (`AccountLookup`, `incrementSessionVersion`, `setSessionVersionIfVersion`), `PasswordHasher.compare`, `infrastructure/account.repository.ts`, `unit-of-work.ts`, `sign-in.use-case.ts`, new use-case spec.
- **Seam / test first:** use-case unit with in-memory repository and deterministic hasher/token service: active → version +1 and returned `ver` in token; pending + correct password → 403 and no version/email change; unknown email and wrong password → the same generic 401; concurrent sign-ins → two increments and two distinct versions.
- **Verification:** `npm run test -w api`; real Postgres probe for `UPDATE ... RETURNING` and idempotent migration.

### Slice 3 — Notification and compensation

- **Files:** extend `sign-in.use-case.ts`; new HTTP cases in `apps/api/test/sign-in.spec.ts`.
- **Seam / test first:** capturing `EmailService` asserts subject, UTC timestamp and en-US body; throwing adapter asserts conditional version restore, no token and 502.
- **Verification:** `npm run test -w api`.

### Slice 4 — `GET /api/v1/auth/me` and stale-token rejection

- **Files:** `apps/api/src/auth/application/get-current-session.use-case.ts`, `apps/api/src/auth/interface/auth.guard.ts`, add `me` route to `sign-in.controller.ts`, module wiring, HTTP spec cases.
- **Seam / test first:** Supertest with Bearer header: current token → 200 non-sensitive data; stale `ver`, expired `exp`, bad signature and missing header → 401 with no account data.
- **Verification:** `npm run test -w api`.

### Slice 5 — `/auth/sign-in` page and Bearer helper

- **Files:** `apps/app/src/auth/sign-in/SignInPage.tsx` + spec, `apps/app/src/auth/api-client.ts` (Bearer helper, 401 cleanup), `apps/app/src/App.tsx` (route), `apps/app/src/index.css` (reuse tokens).
- **Design plan:** reuse 001's left-aligned single column, linen background, parchment fields, powder-blue action, hairline rule, system sans for controls and Georgia heading. Two labelled fields in keyboard order, submitting label "Signing in…", inline `role="alert"` errors, generic offline message. No shadcn, no third-party scripts, light theme only.
- **Seam / test first:** React Testing Library with mocked `fetch` and `localStorage`: labelled fields, `auth_token` write, navigation to `/app/home`, 401 cleanup and retry, submitting state.
- **Verification:** `npm run test -w app`, `npm run build -w app`.

### Slice 6 — Docs, environment and ADR

- **Files:** `.env.example` (`JWT_SECRET`), `.docs/DEVELOPMENT.md`, `.docs/ARCHITECTURE.md`, `.docs/QA.md`, `README.md`, `.adrs/0003-sessions.md`.
- **Seam / test:** manual review against AC-14 and AC-11 — `JWT_SECRET` with production warning, single-active-session rule, `/auth/me` seam, localStorage tradeoff and mitigations documented; `GET /` probe retained in QA.
- **Verification:** `npx prettier --check "**/*.{ts,tsx,md}"`.

### Slice 7 — Full quality gate and delivery

- **Files:** none (verification only).
- **Verification:** `npm run lint`, `npm run check-types`, `npm run test`, `npm run build`, prettier check, `npm run db:migrate` twice; real Postgres probe optional if infra is up. Commit and push via `/commit-and-push`.

## Dependencies & additions

- `apps/api`: `jsonwebtoken` + `@types/jsonwebtoken`. No OIDC/JWK stack. Client reuses `react-router-dom` from 001.
- Migration `drizzle/0002_sign_in.sql` generated with `drizzle-kit generate --name=sign_in`; never renumber `0000_initial` or `0001_sign_up`.
- `JWT_SECRET` in `.env.example` as a development-only default with an explicit production warning.
- CORS `allowedHeaders: ["Content-Type", "Authorization"]` in `configureApp()`; no credentials.
- ADR `.adrs/0003-sessions.md` for D-1/D-2/D-3/D-4.

## Risks, assumptions & follow-ups

- Compensation must not clobber a concurrent login: restore only when the current version still equals the version this login issued (`setSessionVersionIfVersion`). Covered by a unit test.
- Atomic increment must read the returned version from the same `UPDATE ... RETURNING`, not a separate read. Verified with a real-DB probe if infra is available.
- Never log tokens or passwords; the console email fallback prints only the session-notification text, not the JWT.
- `localStorage` remains an accepted XSS tradeoff with the four documented mitigations; no cross-tab sync or sign-out in this spec.
- Deliberate deferrals: confirmation-created sessions (003), reset (004/005), route guard (006), sign-out/refresh/OAuth/MFA.
- Infra was available during 001; if it is not during this spec, migration probes are reported as skipped rather than assumed.

## Implementation notes

- A temporary real-Postgres probe verified `session_version` defaults to 0, two sign-ins increment it to exactly 2, only the second token passes `/auth/me`, and the first returns 401. The probe was removed afterwards; deterministic tests use in-memory ports.
- `extractErrorMessage` moved from `SignUpPage` to the shared `auth/api-client.ts` so both auth forms read API errors identically; sign-up tests still pass.
- One intermediate `vitest run` timed out because source files were being written while the runner was active; a clean re-run passed. No product defect was involved.

## Quality checks (from QA.md)

- [x] `npm run lint` — pass
- [x] `npm run check-types` — pass
- [x] `npm run test` — pass (60 tests: 36 API, 24 client)
- [x] `npm run build` — pass; `apps/app/dist/**` present
- [x] `npx prettier --check "**/*.{ts,tsx,md}"` — pass
- [x] `npm run db:migrate` twice — pass after `npm run infra:up`; `session_version` defaults to 0

## Manual QA

1. Apply migrations, start API/client, open `/auth/sign-in` — labelled email/password, visible focus, responsive light theme.
2. Submit valid credentials for an active account — button shows "Signing in…", then browser lands on `/app/home` and `localStorage.auth_token` holds the JWT.
3. Read the console fallback (or Mailtrap) — "A new session was created" with UTC time and the security sentence.
4. Sign in again from a second browser profile — both tokens obtained; `GET /api/v1/auth/me` with the first returns 401, with the second returns 200.
5. Try unknown email, wrong password and a `pending` account — generic 401 twice, 403 with confirmation guidance once; no email and no version change on failures.
6. Send a stale/expired/tampered token and no header to `/auth/me` — 401 with no account data.
7. Force an email failure — 502, version restored, no token returned.
8. Open `/` and submit a fresh sign-up — 001 contracts still work.

## Rollback

Revert the commit and `0002_sign_in` migration. Tokens issued under the removed column stop validating; previously incremented version values cannot be restored by a code rollback (documented limit).

## Approval

- [x] Approved by the user on 2026-11-25 — scope as written above.
