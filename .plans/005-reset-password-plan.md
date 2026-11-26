# Implementation plan — Reset Password — Token Consumption and Password Change

- **Spec:** specs/005-reset-password.md
- **Status:** proposed
- **Created:** 2026-11-25

## Objective

A user who opened the one-hour link from `004-forgot-password` can set a new password once: `POST /api/v1/auth/reset-password` atomically claims the token, replaces the bcrypt hash and increments `session_version`, sends a token-free "Your password has been reset" email, and returns 200; mismatch/short passwords return 400, every invalid link returns one 410, and a failed notification restores hash/usage/version and returns 502. The public `/auth/reset-password?token={TOKEN}` form clears `auth_token` and sends the user to `/auth/sign-in`, where the new password works and every earlier JWT no longer does.

## Context loaded

- **AGENTS.md files read:** root `AGENTS.md` (Turborepo guidance; no Turborepo config or command change is planned, so the installed `turbo` docs are not needed) and `.docs/AGENTS.md`. `find` confirmed no nested `AGENTS.md` in `apps/api`, `apps/app`, `drizzle` or `.adrs`.
- **Context pack read:** `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/RULES.md`, `.docs/QA.md`, `.docs/BUSINESS.md` (feature context; no connector work — this is an auth capability), `.docs/DESIGN.md`, `.docs/DESIGN_SYSTEM.md` (UI work).
- **Skills loaded:** `implement-me` + `references/plan-template.md`, `tdd` (seams agreed below: HTTP contract, use case, email capture, session invalidation, client render, docs/ADR manual — no tests are written at other seams), `frontend-design` (light-theme, token-driven form matching the existing auth pages). `shadcn`, Playwright and the Next.js skills are deliberately not used: the spec excludes shadcn/E2E and the client is React + Vite. `.docs/AGENTS.md` also names `web-design-guidelines`, which is not available in this session; `DESIGN.md`/`DESIGN_SYSTEM.md` and the existing auth-page CSS supply the design constraints instead.
- **Verified in code/config:**
  - `specs/005-reset-password.md` is `ready-for-implementation`: 13 Given/When/Then ACs, D-1…D-7 closed, "Open questions: None". A readiness pass against the current code found no gap, so no spec edit or `feature-concept` interview was needed.
  - `package.json`, `turbo.json`, `apps/api/package.json`, `apps/app/package.json`: real root checks are `npm run lint`, `npm run check-types`, `npm run test`, `npm run build`, `npm run db:migrate`, `npm run infra:up`; workspace filters (`npm run test -w api`) work. `node_modules` is absent in this worktree, so `npm install` is required before checks.
  - In-range dependency `004-forgot-password` is already implemented (`git log`: `41b277b feat(auth): add uniform password-reset request flow`): `password_reset_tokens` exists in `apps/api/src/auth/infrastructure/schema.ts` with `token_hash`, `expires_at`, `used_at`, `created_at`, a unique hash index and a partial unique index on `user_id WHERE used_at IS NULL`; `drizzle/0003_forgot_password.sql` is already applied in migration history. No new table or migration is needed.
  - `PasswordResetTokenRepository` (`domain/ports.ts`, `infrastructure/password-reset-token.repository.ts`) currently has `create`, `findNewestUnconsumedByUserId`, `invalidateUnconsumedByUserId`, `removeById`; it has no conditional claim/release. `ConfirmationTokenRepository.claimByHash`/`releaseClaim` (`infrastructure/confirmation-token.repository.ts`) is the exact pattern to mirror for one-shot consumption.
  - `AccountRepository` (`domain/ports.ts`, `infrastructure/account.repository.ts`) already has `findById`, `incrementSessionVersion`, `setSessionVersionIfVersion`, `restorePendingSession`; it has no combined password + version write or its inverse. `GetCurrentSessionUseCase` rejects a JWT whose `ver` differs from `users.session_version`, so incrementing that counter is sufficient to invalidate old sessions.
  - `PasswordHasher.hash/compare` (`bcrypt-password-hasher.ts`), `hashToken()` and `generateOpaqueToken()` (`domain/tokens.ts`), `EmailService.send` (`domain/email.ts`) and the Mailtrap/Resend/console factory are already available; no new dependency is required.
  - `MIN_PASSWORD_LENGTH = 8` and `PasswordsMatchConstraint` live in `interface/dto/sign-up-request.dto.ts` and `interface/dto/passwords-match.constraint.ts`; the constraint reads `args.object.password`, so it works unchanged on a reset DTO with the same field names. `apps/api/src/setup.ts` applies the global `api/v1` prefix and strict `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`; controller-level error mapping is the established pattern (`confirm-account.controller.ts`).
  - `ConfirmAccountUseCase` is the compensation blueprint: transactional claim + state change, post-commit email, and a second transaction that releases the claim and restores state before throwing a notification error; `ConfirmAccountController` maps that to 410/502.
  - HTTP seam: `apps/api/test/confirm-account.spec.ts` and `forgot-password.spec.ts` boot `AppModule` with `NestFactory.create(AppModule, { logger: false })`, `configureApp(app)` and Supertest, spying on the use case. Use-case seam: `apps/api/src/auth/application/confirm-account.use-case.spec.ts` and `forgot-password.use-case.spec.ts` use in-memory repository fakes and a capturing `EmailService`.
  - Client seam: `apps/app/src/auth/sign-in/SignInPage.test.tsx`, `confirm-account/ConfirmAccountPage.test.tsx` and `App.test.tsx` use React Testing Library, `MemoryRouter` and stubbed `fetch`. `api-client.ts` already exports `clearAuthToken()` and `extractErrorMessage()`; `apiFetch` attaches any stored `auth_token` and clears it on 401.
  - `apps/app/src/App.tsx` routes are `/`, `/auth/sign-up`, `/auth/sign-in`, `/auth/confirm-account`, `/auth/forgot-password`, `/app/home`; `/auth/reset-password` does not exist yet. `apps/app/src/index.css` groups `.sign-up-page`, `.sign-in-page`, `.confirm-account-page`, `.forgot-password-page` for layout/heading/link styling and already defines `.hint`, `.field-error`, `.success-message`, input and button states.
  - ADR history ends at `.adrs/0006-landing-route.md` (merged from `main`); the next free number is `0007`. `README.md` and `.docs/ARCHITECTURE.md/DEVELOPMENT.md/QA.md` still say that reset consumption and the password change are deferred to 005. The landing-route redirect at `/` (`Navigate` to `/auth/sign-in`) is preserved unchanged.
- **Target items not yet implemented:** reset-token claim/release ports, account password/version write + restore ports, `ResetPasswordUseCase`, reset-confirmation email text, `POST /auth/reset-password` DTO/controller/module wiring, the `/auth/reset-password` page and route, ADR 0007, doc/QA updates and all corresponding tests.

## Decisions carried from the spec

- **D-1 — Token in the POST body with a uniform 410** — mirrors 003 and keeps the raw token out of server logs and Referer headers; ADR: recorded alongside D-2 in `.adrs/0007-reset-password.md`.
- **D-2 — Invalidate all existing sessions by incrementing `session_version`** — a password change must stop an attacker holding an older JWT; rule inherited from 002 and already enforced by `GetCurrentSessionUseCase`; ADR: yes, `.adrs/0007-reset-password.md` (primary decision).
- **D-3 — Success email "Your password has been reset" with UTC time and no token link** — confirms the change without creating a second actionable credential; ADR: not needed.
- **D-4 — Compensate hash, `used_at` and version on email failure, then return 502** — mirrors 001–003 and 004's compensation discipline; ADR: recorded in `.adrs/0007-reset-password.md` with the rejected alternatives.
- **D-5 — Reuse the minimum-8/match password policy from 001** — one rule across sign-up and reset; ADR: not needed (verified in `sign-up-request.dto.ts`).
- **D-6 — Client clears `auth_token` on success** — after D-2 the stored JWT is stale by definition; ADR: not needed (`clearAuthToken()` already exists).
- **D-7 — No new migration or dependency** — all tables, hashing, validation and email capabilities exist from 001–004; ADR: not needed (verified in `schema.ts`, `apps/api/package.json`, `apps/app/package.json`).
- Repository facts used: `Activation`/`claimByHash` + `releaseClaim` compensation in `confirm-account.use-case.ts`; one transaction per `UnitOfWork.run` (`infrastructure/unit-of-work.ts`); global `/api/v1` + strict validation (`setup.ts`); `hashToken()` (`domain/tokens.ts`); `GET /auth/me` version check (`get-current-session.use-case.ts`); shared CSS tokens and form styles (`apps/app/src/index.css`).

## Approach

Extend the existing `apps/api/src/auth/` four-layer slice; add no new module, package, table or migration. Add two narrow port methods for a one-shot reset-token claim (`claimByHash` with `used_at IS NULL AND expires_at > now`, plus conditional `releaseClaim`) and two conditional account methods (password + version write guarded by the read version, and its inverse restore). `ResetPasswordUseCase` hashes the new password outside the transaction to keep the write lock short, then inside one `UnitOfWork.run` claims the token, reads the account, and conditionally replaces hash and version; the claim's returned `usedAt` and the old hash/version are held in memory only. A failed post-commit email triggers a second transaction that conditionally releases the claim and restores hash/version before a 502 is returned — no raw token or plaintext password is logged. The controller maps the two new domain errors to one 410 message and one generic 502 message and returns a short en-US acknowledgement with no token or password. On the client, add a single-column public form matching the existing sign-in/forgot-password pages: query-token read, two labelled password fields, local mismatch check, submitting state, `role="alert"` errors, `clearAuthToken()` and navigation to `/auth/sign-in` on 200, and a reset-request link on 410. Update docs, QA.md and ADR 0007 in the same change.

## Work breakdown (vertical slices)

### Slice 1 — One-shot reset-token claim and conditional credential/version ports

- **Files:** `apps/api/src/auth/domain/ports.ts` (`PasswordResetTokenRepository.claimByHash(tokenHash, now)` and `releaseClaim(tokenHash, claimedUsedAt)` reusing `TokenClaim`; `AccountRepository.setPasswordAndIncrementVersionIfVersion(id, passwordHash, expectedVersion, newVersion): Promise<number | null>` and `restorePasswordAndVersion(id, oldPasswordHash, issuedVersion)`), `apps/api/src/auth/infrastructure/password-reset-token.repository.ts` (conditional `UPDATE ... SET used_at = now ... RETURNING user_id, used_at`, and conditional release), `apps/api/src/auth/infrastructure/account.repository.ts` (conditional `UPDATE users ... WHERE id AND session_version = expected RETURNING session_version`, and restore guarded on the issued version). `unit-of-work.ts` and `schema.ts` stay unchanged because the repositories are already wired and the table already exists. Add the new abstract methods mechanically to every in-memory fake in `apps/api/src/auth/application/sign-up.use-case.spec.ts`, `sign-in.use-case.spec.ts`, `confirm-account.use-case.spec.ts`, `forgot-password.use-case.spec.ts`, `apps/api/test/sign-up.spec.ts`, `apps/api/test/sign-in.spec.ts` without changing existing assertions.
- **Seam / test:** repository/use-case port seam — `claimByHash` returns a claim only for an unconsumed, unexpired hash and cannot claim the same row twice; `releaseClaim` clears `used_at` only when it still equals the claim's value; the guarded account write returns `null` on a stale version and the restore is conditional. Optional real-SQL probe (`RUN_DB_PROBE=1 npm run test -w api`) verifies the conditional updates against local Postgres; in-memory fakes verify the contract deterministically.
- **Verification:** `npm run test -w api`, `npm run check-types -w api`.

### Slice 2 — `ResetPasswordUseCase`, reset-notification email text and compensation

- **Files:** `apps/api/src/auth/domain/errors.ts` (new `InvalidPasswordResetTokenError` with the exact 410 message and `PasswordResetNotificationError` with the generic 502 message), `apps/api/src/auth/domain/reset-confirmation-email.ts` (new en-US text helper taking `now`: UTC timestamp + "If this wasn't you, reset it again immediately.", no token-bearing link), `apps/api/src/auth/application/reset-password.use-case.ts` (new) and `reset-password.use-case.spec.ts` (new).
- **Seam / test:** use-case unit with in-memory transactional repositories, a `PasswordHasher` fake, a capturing `EmailService` and a fixed clock: valid token changes the hash to bcrypt of the new password, marks `used_at`, increments version by exactly one, sends exactly one email with subject "Your password has been reset" and the required text; expired/used/unknown tokens and a missing account throw `InvalidPasswordResetTokenError` with no writes or email; a stale version throws the same; a throwing email adapter restores the old hash, null `used_at` and the old version and throws `PasswordResetNotificationError`; two concurrent executions yield one success and one 410; assertions never see the raw token or plaintext password. Covers AC-1, AC-2, AC-3, AC-6, AC-7, AC-8, AC-10.
- **Verification:** `npm run test -w api`, `npm run check-types -w api`.

### Slice 3 — `POST /api/v1/auth/reset-password` HTTP contract

- **Files:** `apps/api/src/auth/interface/dto/reset-password-request.dto.ts` (new: `@IsString @IsNotEmpty` token, `@IsString @MinLength(MIN_PASSWORD_LENGTH)` password, `@IsString @Validate(PasswordsMatchConstraint)` confirmPassword), `apps/api/src/auth/interface/reset-password.controller.ts` (new: `@HttpCode(200)`, success body `{ message: "Your password has been reset." }`, `GoneException` for `InvalidPasswordResetTokenError`, `BadGatewayException` for `PasswordResetNotificationError`, all other errors rethrown), `apps/api/src/auth/auth.module.ts` (register controller + use case), `apps/api/test/reset-password.spec.ts` (new Supertest suite following `confirm-account.spec.ts`).
- **Seam / test:** HTTP boundary — 200 body with no token/password, 400 for missing/empty fields, short passwords, mismatched values and unknown fields, one exact 410 message for expired/used/unknown tokens, generic 502 without success hints, generic 500 for operator-only DB errors, 404 on GET, and unchanged `GET /`. Covers AC-1, AC-4, AC-5, AC-6, AC-7, AC-8, AC-10.
- **Verification:** `npm run test -w api`, `npm run lint -w api`, `npm run check-types -w api`.

### Slice 4 — Session invalidation seam (pre-reset JWT rejected by `/auth/me`)

- **Files:** `apps/api/test/reset-password-session.spec.ts` (new) — boot `AppModule` with an overridden in-memory `UnitOfWork` holding an active account and a seeded unconsumed reset token, use the real `ResetPasswordUseCase`, `GetCurrentSessionUseCase`, `PasswordHasher`, `AccessTokenService` and capturing `EmailService`, then call `POST /api/v1/auth/reset-password` and `GET /api/v1/auth/me` with a JWT signed before the reset.
- **Seam / test:** HTTP session seam — the pre-reset JWT gets 401 with no account data after a successful reset, while a sign-in with the new password would issue a valid token; misses browser `localStorage` behavior. Covers AC-9.
- **Verification:** `npm run test -w api`.

### Slice 5 — Public `/auth/reset-password` client page

- **Files:** `apps/app/src/auth/reset-password/ResetPasswordPage.tsx` + `ResetPasswordPage.test.tsx` (new), `apps/app/src/App.tsx` + `apps/app/src/App.test.tsx` (route + route test), `apps/app/src/index.css` (add `.reset-password-page` to the existing grouped layout, `h1`, link and focus selectors; reuse current form/error/hint/button styles and CSS variables).
- **Design plan:** reuse the existing single-column light auth layout — `--linen` background, `--parchment` inputs, hairline Georgia heading rule, powder-blue action, visible focus, responsive down to mobile, no dark mode. Read `token` from `useSearchParams`; missing token shows the generic link-error `role="alert"` and a `/auth/forgot-password` link. Two persistent labelled fields named `password` and `confirmPassword`, both `type="password"`, `autocomplete="new-password"`, `minLength={8}`, with "Use at least 8 characters." as `aria-describedby` hint; local mismatch error "Passwords do not match." prevents the request. Submit button toggles "Reset password" → "Resetting password…" and is disabled while in flight. On 200 call `clearAuthToken()` then `navigate("/auth/sign-in")`; on 410 show "This password reset link is invalid or has expired." with a "Request a new reset link" link; on 400 show the server validation message; on 502/network show "Unable to reset your password. Please try again."; errors stay visible after failure. No shadcn/ui, third-party scripts, new color tokens or token echo in the UI.
- **Seam / test:** React Testing Library with stubbed `fetch` and `MemoryRouter` — labelled fields/DOM order, hint, local mismatch without a request, submitting state, POST to `/api/v1/auth/reset-password` with `{ token, password, confirmPassword }`, `auth_token` removal and navigation on 200, 410/400/502/network `role="alert"` states, and keyboard-reachable link on 410. Covers AC-11, AC-12.
- **Verification:** `npm run test -w app`, `npm run build -w app`, `npm run check-types -w app`.

### Slice 6 — Docs and ADR

- **Files:** `.adrs/0007-reset-password.md` (new: D-2 as the primary decision with rejected alternatives of keeping sessions and revoking all but the current one; record D-1 uniform 410, D-4 compensation, the conditional claim/restore SQL, and the accepted crash-between-commit-and-email gap), `.docs/DEVELOPMENT.md`, `.docs/ARCHITECTURE.md`, `.docs/QA.md` (new "Reset-password checks" section), `README.md`.
- **Seam / test:** manual review against AC-13 — endpoint and page listed as current, session invalidation and 410/502 policies documented with ADR 0007, new QA steps present, stale "deferred to `005-reset-password`" wording removed, and no raw token or plaintext password in logs/responses. No new environment variable or migration is documented because neither is introduced.
- **Verification:** `npx prettier --check "**/*.{ts,tsx,md}"`.

### Slice 7 — Full quality gate (verification only)

- **Files:** none.
- **Verification:** `npm install` if `node_modules` is absent, then `npm run lint`, `npm run check-types`, `npm run test`, `npm run build` (assert `apps/app/dist/**` exists), `npx prettier --check "**/*.{ts,tsx,md}"`; `npm run infra:up` + `npm run db:migrate` when Docker/Supabase is available; optional `RUN_DB_PROBE=1 npm run test -w api`. Report skipped checks rather than claiming they passed. No commit or push in this planning phase.

## Dependencies & additions

- No new packages: reuse `bcrypt`, `class-validator`, Drizzle, `jsonwebtoken`, `react-router-dom`, `EmailService`, `PasswordHasher` and the existing token helpers.
- No new migration, table, column, feature flag or backfill: `password_reset_tokens` and `users.session_version` already exist from 004/002.
- One new ADR (`.adrs/0007-reset-password.md`); no new environment variable — `APP_URL` is not needed by the reset-notification email because it carries no link.

## Risks, assumptions & follow-ups

- A plain read-then-write of the account row could lose a concurrent update; the guarded `setPasswordAndIncrementVersionIfVersion` returns `null` on a stale version and is treated as an invalid link, so exactly one of two concurrent submissions succeeds. If the real-SQL probe is skipped, concurrency is only proven with serialized in-memory fakes — report that limitation honestly.
- `PasswordHasher.hash()` runs before the transaction to shorten the write lock; an invalid token may still incur bcrypt cost. This is accepted because it does not change observable behavior or leak token state.
- Email dispatch happens after commit; a process crash between commit and send leaves the password changed with no notification and no automatic reversal (same tradeoff as 001–004). The compensating transaction covers only an in-flight adapter throw.
- Adding abstract port methods breaks every in-memory fake until updated; keep those edits mechanical so existing assertions remain unchanged.
- `apiFetch` may attach a stale `auth_token` to the public reset POST; it is cleared on success per D-6 and a 401 from any other call also clears it. No JWT is issued by this spec.
- Uniform 410 for expired/used/unknown tokens must not vary in body, status or logs; no raw token is logged anywhere, and error logs use token ids only where needed.
- In-range dependency `004-forgot-password` is present and must remain unchanged; this change must not alter sign-up, sign-in, confirmation, forgot-password or `GET /auth/me` contracts, and it must leave the `/app/*` guard to 006.
- Deliberate deferrals: `/app/*` guard (`006`), sign-out/refresh/rotation/OAuth/MFA, email change, resending confirmation links, shadcn/ui and Playwright E2E.
- Commit and push remain with the parent orchestrator; this plan stops at the approval gate.

## ADR candidates

- **D-2 — invalidate every existing session on password reset** — externally visible security policy with rejected alternatives; primary subject of ADR 0007.
- **D-1/D-4 — one uniform 410 for all invalid links and compensation of hash/usage/version on email failure** — externally visible failure policy with rejected alternatives; record in the same ADR 0007 together with the conditional claim/restore implementation detail.

## Quality checks (from QA.md)

- [ ] `npm install` (only if `node_modules` is absent)
- [ ] `npm run lint`
- [ ] `npm run check-types`
- [ ] `npm run test`
- [ ] `npm run build` (assert `apps/app/dist/**` exists)
- [ ] `npx prettier --check "**/*.{ts,tsx,md}"`
- [ ] `npm run infra:up` && `npm run db:migrate` (skip and report if Docker/Supabase unavailable)
- [ ] Optional: `RUN_DB_PROBE=1 npm run test -w api`

## Manual QA

1. With API on 3000, client on 5173 and Postgres on 54322 (`npm run infra:up`, `npm run db:migrate`, `npm run dev`), sign up and confirm an account, sign in to obtain a JWT, then request a reset with 004 and read the console fallback (or Mailtrap) "Reset your password" email for the `{APP_URL}/auth/reset-password?token={TOKEN}` link.
2. Open that link: two labelled password fields in keyboard order, visible focus, "Use at least 8 characters." hint, responsive light theme, no dark mode. Submit mismatched values and a value under 8 characters — en-US `role="alert"` errors, no request for the local mismatch, and no account changes.
3. Submit a valid pair: the button reads "Resetting password…" while in flight, `auth_token` is removed from `localStorage`, the browser lands on `/auth/sign-in`, and a 200 acknowledgement contains no token or password.
4. Inspect `users` and `password_reset_tokens`: `password_hash` verifies the new password and not the old one, the token row has non-null `used_at` with unchanged `token_hash`, and `session_version` increased by exactly one. Sign in with the new password and confirm the new JWT validates, then call `GET /api/v1/auth/me` with the pre-reset JWT — 401 with no account data.
5. Read the success email: subject "Your password has been reset", body contains the UTC time and "If this wasn't you, reset it again immediately.", and no token-bearing link; all user-facing text is en-US.
6. Replay the same link and POST an expired-token and an unknown-token body: identical 410 "This password reset link is invalid or has expired." with no second hash change, version increment or email. Open the page without `token` and see the same message plus a `/auth/forgot-password` link.
7. Force `EmailService` to throw for a fresh token: previous `password_hash` restored, `used_at` null again, `session_version` restored, 502 with a generic en-US message and no success email; the same link can then be retried.
8. Confirm no raw token or plaintext password appears in responses or logs, run `npm run db:migrate` a second time, and re-check `GET /`, `/`, sign-up, sign-in, confirmation, forgot-password and `/auth/me` contracts.

## Rollback

Revert the commit. No migration or table is owned by this spec, so there is nothing to drop; previously issued reset links become unusable because the consuming endpoint disappears. Password hashes and `session_version` values changed by the released code are not automatically restored by a rollback — the compensating transaction only covers an email adapter failure while the code is running.

## Approval

- [ ] Approved by parent orchestrator/user — pending; this plan stops at the approval gate.
