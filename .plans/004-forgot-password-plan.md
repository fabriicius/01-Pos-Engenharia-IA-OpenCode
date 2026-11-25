# Implementation plan — Forgot Password — Reset Request and Tokenized Email

- **Spec:** specs/004-forgot-password.md
- **Status:** proposed
- **Created:** 2026-11-25

## Objective

A user can request password recovery from the public `/auth/forgot-password` page: `POST /api/v1/auth/forgot-password` always returns the same en-US 202 for a well-formed email, while only an `active` account gets one "Reset your password" email with a one-hour hashed-token link and a silent 60-second cooldown suppresses duplicates without changing the response. A failed email dispatch removes the token and logs the error but still returns the identical 202.

## Context loaded

- **AGENTS.md files read:** root `AGENTS.md` (Turborepo guidance; no Turborepo config or command change is planned, so the installed `turbo` docs are not needed) and `.docs/AGENTS.md`. `find` confirmed no nested `AGENTS.md` in `apps/api`, `apps/app`, `drizzle` or `.adrs`.
- **Context pack read:** `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/RULES.md`, `.docs/QA.md`, `.docs/BUSINESS.md` (feature context; no connector work), `.docs/DESIGN.md`, `.docs/DESIGN_SYSTEM.md` (UI work).
- **Skills loaded:** `implement-me` + `references/plan-template.md`, `feature-concept` (readiness pass only — spec unchanged), `tdd` (seams: HTTP, use case/token, email, client render, migration), `frontend-design` (light-theme, token-driven form). `shadcn` and Playwright are deliberately not used (spec excludes both); Next.js skills do not apply because the client is React + Vite.
- **Verified in code/config:**
  - `specs/004-forgot-password.md` is `ready-for-implementation`: 13 Given/When/Then ACs, D-1…D-8 closed, "Open questions: None" — `feature-concept` reported no gap, so no spec edit was made.
  - `package.json`, `turbo.json`, `apps/api/package.json`, `apps/app/package.json`: real root checks are `npm run lint`, `npm run check-types`, `npm run test`, `npm run build`, `npm run db:migrate`, `npm run infra:up`; workspace filters such as `npm run test -w api` are supported. No `node_modules` is present in this worktree, so `npm install` is required before running checks.
  - `apps/api/src/auth/domain/tokens.ts` already provides `generateOpaqueToken()` (32 random bytes, base64url) and `hashToken()` (SHA-256 hex); only a one-hour TTL constant must be added.
  - `apps/api/src/auth/domain/ports.ts` has `UnitOfWork.run` and abstract repositories for accounts and confirmation tokens; `apps/api/src/auth/infrastructure/unit-of-work.ts` wraps every `run` in one Drizzle transaction. Adding a reset-token port requires updating all in-memory fakes in `apps/api/src/auth/application/*.spec.ts` and `apps/api/test/*.spec.ts`.
  - `apps/api/src/auth/infrastructure/schema.ts` + `drizzle/schema.ts` define what `drizzle-kit` sees; `drizzle/0000_initial.sql`, `0001_sign_up.sql`, `0002_sign_in.sql` and `drizzle/meta/_journal.json` are the existing migration history — 003 added no migration, so the new one is `0003_forgot_password`.
  - `npx drizzle-kit generate --name forgot_password` is available (verified via `--help`) and can generate SQL + snapshot + journal entry without a running database.
  - `apps/api/src/setup.ts` applies the global `api/v1` prefix and `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`; controller-level error mapping is the established pattern (`confirm-account.controller.ts`, `auth.controller.ts`).
  - `apps/api/src/auth/domain/email.ts` (`EmailService.send`), `session-email.ts` helper and email factory (Mailtrap default, Resend in production, console fallback) are reusable as-is; `APP_URL` fallback is `http://localhost:5173`.
  - Existing HTTP seam: `apps/api/test/confirm-account.spec.ts` and `sign-in.spec.ts` use `NestFactory.create(AppModule)`, `configureApp(app)`, `vi.spyOn(app.get(UnitOfWork), "run")` and Supertest. Client seam: `apps/app/src/auth/sign-in/SignInPage.test.tsx` and `App.test.tsx` use React Testing Library with stubbed `fetch`; `apps/app/src/index.css` already provides palette, form, error and success styles.
  - `apps/app/src/App.tsx` routes are `/`, `/auth/sign-up`, `/auth/sign-in`, `/auth/confirm-account`, `/app/home`; `/auth/forgot-password` does not exist yet (grep across the repo found only spec/plan references). ADR history ends at `.adrs/0004-confirm-account.md`.
  - In-range dependency `003-confirm-account` is already implemented in this worktree (`ConfirmAccountUseCase`, `ConfirmAccountController`, `ConfirmAccountPage`, ADR 0004), so this spec builds on the current `active` account state without changing it.
- **Target items not yet implemented:** `password_reset_tokens` table/migration, reset-token port + Drizzle repository, `ForgotPasswordUseCase` + email text helper, `POST /auth/forgot-password` controller/DTO/module wiring, `/auth/forgot-password` page and route, docs/ADR and QA steps, plus the corresponding tests.

## Decisions carried from the spec

- **D-1 — Own `password_reset_tokens` table with a one-hour hashed token** — separate reset semantics from confirmation; ADR: not needed (verified by `001-sign-up.md` token model).
- **D-2 — Uniform HTTP 202 body for every well-formed email** — prevents account enumeration; ADR: yes, `.adrs/0005-forgot-password.md`.
- **D-3 — Silent 60-second cooldown derived from token `created_at`** — throttles without a new store or a different response; ADR: same ADR as D-2.
- **D-4 — A new valid request invalidates earlier unconsumed tokens** — one actionable link per account; ADR: not needed. A DB partial unique index on `user_id WHERE used_at IS NULL` enforces the stated invariant as a backstop.
- **D-5 — `pending` accounts are treated like unknown emails** — recovery does not bypass confirmation; ADR: not needed (verified by `specs/003-confirm-account.md` status transition).
- **D-6 — On email failure, remove the new token, log and keep 202** — a different status would disclose account existence; ADR: yes, same ADR as D-2.
- **D-7 — Route `/auth/forgot-password` with the generic success message** — familiar en-US wording and a sign-in next step; ADR: not needed.
- **D-8 — No new dependencies** — token/hash and email capabilities already exist; ADR: not needed (verified in `apps/api/package.json`, `apps/app/package.json`).
- Repository facts used: `UnitOfWork.run` supplies one transaction (`infrastructure/unit-of-work.ts`); global `/api/v1` + strict validation (`setup.ts`); `hashToken`/`generateOpaqueToken` (`domain/tokens.ts`); `APP_URL` fallback and console email fallback (`email-service.factory.ts`, `confirm-account.use-case.ts`); shared CSS tokens and form styles (`apps/app/src/index.css`).

## Approach

Extend the existing `apps/api/src/auth/` four-layer slice; add no new module or package. Add a narrow `PasswordResetTokenRepository` port plus a `findByEmailForUpdate` account query so a single `UnitOfWork.run` transaction locks the account row, checks the newest unconsumed token's `created_at`, invalidates older rows and inserts the hashed token — this serializes concurrent requests for the same account. Generate the migration with `drizzle-kit` (including its metadata) rather than hand-editing the journal. The use case returns a result indicating whether a token was issued, normalized to the same 202 response by the controller; email dispatch happens outside the transaction and a failure deletes only the newly issued row, logs the provider error without the raw token or email, and still yields the uniform response. On the client, add a single-column public form matching the existing sign-in/confirmation pages: labelled email input, submitting state, one generic success message, sign-in link, `role="alert"` errors and network fallback. Update docs and ADR 0005 in the same change.

## Work breakdown (vertical slices)

### Slice 1 — `password_reset_tokens` table and idempotent migration

- **Files:** `apps/api/src/auth/infrastructure/schema.ts` (`password_reset_tokens`: `id` UUID PK, `user_id` UUID FK → `users.id` ON DELETE CASCADE, `token_hash` text unique, `expires_at`/`created_at` timestamptz, nullable `used_at`, partial unique index on `user_id WHERE used_at IS NULL`), `drizzle/0003_forgot_password.sql`, `drizzle/meta/0003_snapshot.json`, `drizzle/meta/_journal.json` (all generated by `npx drizzle-kit generate --name forgot_password`). `drizzle/schema.ts` already re-exports the schema and stays unchanged.
- **Seam / test:** migration seam — a clean local database migrated twice still has exactly the documented columns/indexes; `npm run db:migrate` must not reapply the table.
- **Verification:** `npx drizzle-kit generate --name forgot_password` (no DB required), then `npm run infra:up && npm run db:migrate && npm run db:migrate` with a Postgres/Supabase probe; report skipped if Docker/Supabase is unavailable.

### Slice 2 — Reset-token persistence ports and Drizzle implementation

- **Files:** `apps/api/src/auth/domain/ports.ts` (new `PasswordResetTokenInput`, `PasswordResetTokenRepository` with `create`, `findNewestUnconsumedByUserId`, `invalidateUnconsumedByUserId`, `removeById`; `PersistencePorts.passwordResetTokens`; `AccountRepository.findByEmailForUpdate`), `apps/api/src/auth/infrastructure/password-reset-token.repository.ts` (new), `apps/api/src/auth/infrastructure/account.repository.ts` (`FOR UPDATE` lookup), `apps/api/src/auth/infrastructure/unit-of-work.ts` (wiring). Update existing abstract-method fakes in `apps/api/src/auth/application/sign-up.use-case.spec.ts`, `sign-in.use-case.spec.ts`, `confirm-account.use-case.spec.ts` and `apps/api/test/sign-up.spec.ts`, `sign-in.spec.ts`, `confirm-account.spec.ts` without changing their assertions.
- **Seam / test:** repository/use-case port seam — newest unconsumed token lookup ignores consumed rows; invalidation only touches unconsumed rows for that user; `findByEmailForUpdate` normalizes the email and locks the row. Optional real-SQL probe (`RUN_DB_PROBE=1 npm run test -w api`) verifies the row lock and the partial unique index; in-memory fakes verify the port contract deterministically.
- **Verification:** `npm run test -w api`, `npm run check-types -w api`.

### Slice 3 — `ForgotPasswordUseCase`, reset email text and compensation

- **Files:** `apps/api/src/auth/domain/password-reset-email.ts` (new en-US text helper: link, one-hour expiry, "If you didn't request this, you can ignore this email."), `apps/api/src/auth/domain/tokens.ts` (add `PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000` and `RESET_COOLDOWN_MS = 60_000` next to the existing helpers), `apps/api/src/auth/application/forgot-password.use-case.ts` (new) and `forgot-password.use-case.spec.ts` (new).
- **Seam / test:** use-case unit with in-memory transactional repositories and capturing email/logger fakes: active account issues a hashed token with `expires_at ≈ now + 1h` and `used_at = null`; email subject/body/link/expiry/ignore note; unknown and `pending` emails issue nothing; repeated request inside 60 seconds issues nothing and leaves the original row untouched; request after 60 seconds invalidates the earlier row and issues a new one; concurrent requests yield one issued token; email failure deletes the new row, logs the error without the raw token/email, and still resolves with the uniform result; assertions cover AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8, AC-9, AC-12.
- **Verification:** `npm run test -w api`, `npm run check-types -w api`.

### Slice 4 — `POST /api/v1/auth/forgot-password` HTTP contract

- **Files:** `apps/api/src/auth/interface/dto/forgot-password-request.dto.ts` (new: `@IsEmail()` email; global pipe rejects empty/malformed/unknown fields with 400), `apps/api/src/auth/interface/forgot-password.controller.ts` (new: `@HttpCode(202)` and the single exact message "If an account exists for that email, a password reset link has been sent." for all well-formed outcomes; no account-state branch or provider-error status), `apps/api/src/auth/auth.module.ts` (register controller + use case), `apps/api/test/forgot-password.spec.ts` (new Supertest suite with in-memory ports and capturing `EmailService`, following `sign-in.spec.ts`).
- **Seam / test:** HTTP boundary — byte-identical 202 body for active, unknown, `pending`, cooldown and email-failure cases; 400 for empty/malformed emails and extra fields; generic Nest 500 for an operator-only DB error; exactly one email only in the eligible case; no raw token in responses. Covers AC-1, AC-3, AC-4, AC-5, AC-7, AC-8.
- **Verification:** `npm run test -w api`, `npm run lint -w api`, `npm run check-types -w api`.

### Slice 5 — Public `/auth/forgot-password` client page

- **Files:** `apps/app/src/auth/forgot-password/ForgotPasswordPage.tsx` + `ForgotPasswordPage.test.tsx` (new), `apps/app/src/App.tsx` + `apps/app/src/App.test.tsx` (route + route test), `apps/app/src/index.css` (add `.forgot-password-page` to the existing shared layout selectors; reuse current form/error/success styles and CSS variables).
- **Design plan:** reuse the 001/002 single-column light layout — `--linen` background, `--parchment` inputs, hairline Georgia heading rule, powder-blue action, visible focus. One labelled email field (`type="email"`, `autocomplete="email"`), submit labelled "Send reset link" → "Sending link…" and disabled while in flight; success keeps the user on the page showing the exact AC-1 message and a keyboard-reachable `/auth/sign-in` link; `role="alert"` for format/network errors, with the generic network text "Unable to send the link. Please try again."; no different copy for any submitted address. No shadcn, third-party scripts, dark mode or new tokens.
- **Seam / test:** React Testing Library with stubbed `fetch` — labelled field/DOM order, submitting state, generic success message and sign-in link regardless of address, format/network `role="alert"` states, POST path `/api/v1/auth/forgot-password` with `{ email }`. Covers AC-10 and AC-11.
- **Verification:** `npm run test -w app`, `npm run build -w app`, `npm run check-types -w app`.

### Slice 6 — Docs and ADR

- **Files:** `.adrs/0005-forgot-password.md` (new: D-2, D-3, D-6 with rejected alternatives — 404/enumeration, IP rate limiting, distinct 502 on provider failure; also record the partial unique index, row-lock serialization, no-restoration of older tokens on compensation, and the accepted "no email on provider failure" tradeoff), `.docs/DEVELOPMENT.md`, `.docs/ARCHITECTURE.md`, `.docs/QA.md`, `README.md`.
- **Seam / test:** manual review against AC-13: new table and endpoint/route listed as current, anti-enumeration response and cooldown policy documented, QA steps added, `APP_URL` reuse documented with no new environment variable introduced, and stale "no password recovery" wording removed where present.
- **Verification:** `npx prettier --check "**/*.{ts,tsx,md}"`.

### Slice 7 — Full quality gate (verification only)

- **Files:** none.
- **Verification:** `npm install` if `node_modules` is absent, then `npm run lint`, `npm run check-types`, `npm run test`, `npm run build` (assert `apps/app/dist/**` exists), `npx prettier --check "**/*.{ts,tsx,md}"`; `npm run infra:up` + `npm run db:migrate` twice when Docker/Supabase is available; optional `RUN_DB_PROBE=1 npm run test -w api`. Report skipped checks rather than claiming they passed. No commit or push in this planning phase.

## Dependencies & additions

- No new packages: reuse `class-validator`, Drizzle, existing `EmailService` adapters, `react-router-dom`, Nest `Logger` and the existing `hashToken`/`generateOpaqueToken` helpers.
- One new generated Drizzle migration (`0003_forgot_password`) with its metadata; no changes to `users` or `account_confirmation_tokens`, no backfill, no feature flag.
- One new ADR (`.adrs/0005-forgot-password.md`); no new environment variable — `APP_URL` keeps its existing fallback.

## Risks, assumptions & follow-ups

- Concurrency: a plain check/insert can race under Postgres `READ COMMITTED`; the plan uses `SELECT ... FOR UPDATE` on the account row inside `UnitOfWork.run` plus the partial unique index so only one unconsumed token exists. If the real-SQL probe is skipped, concurrency is only proven with serialized in-memory fakes — report that limitation honestly.
- Response timing cannot be made literally constant because an eligible request performs DB work and an email send; "no timing-visible branch" is interpreted as no branch-specific status/body/delay and no account state in the response. Constant-time behavior would require artificial delays and is outside this spec.
- Uniform 202 on provider failure means an existing account may end a request without a usable link; this is the accepted anti-enumeration tradeoff (D-6). Older tokens are not restored after compensation; only the new row is removed.
- Adding abstract port methods breaks every in-memory fake until updated; keep those edits mechanical so existing assertions and behavior remain unchanged.
- The cooldown is per email/account only; multiple accounts and IP-level abuse are out of scope (no IP rate limiting per spec).
- In-range dependency `003-confirm-account` is present; this change must not alter its 200/400/410/502 contracts or the sign-up/sign-in/`me` contracts.
- Deliberate deferrals: token consumption, reset page, password change and session invalidation (`005`); `/app/*` guard (`006`); sign-out/refresh/OAuth/MFA; shadcn/ui and Playwright E2E.
- Commit and push remain with the parent orchestrator; this plan stops at the approval gate.

## ADR candidates

- **D-2/D-3/D-6 — uniform 202, silent 60-second cooldown, email-failure compensation** — externally visible anti-enumeration policy with rejected alternatives; ADR 0005.
- Implementation adjustments to record in the same ADR: account-row locking + partial unique index for the one-unconsumed-token invariant, and deliberate non-restoration of older tokens after a failed send.

## Quality checks (from QA.md)

- [ ] `npm install` (only if `node_modules` is absent)
- [ ] `npm run lint`
- [ ] `npm run check-types`
- [ ] `npm run test`
- [ ] `npm run build` (assert `apps/app/dist/**` exists)
- [ ] `npx prettier --check "**/*.{ts,tsx,md}"`
- [ ] `npm run infra:up` && `npm run db:migrate` twice (skip and report if Docker/Supabase unavailable)
- [ ] Optional: `RUN_DB_PROBE=1 npm run test -w api`

## Manual QA

1. With API on 3000, client on 5173 and Postgres on 54322 (`npm run infra:up`, `npm run db:migrate`, `npm run dev`), confirm a `pending` account via 003 so an `active` email exists.
2. Open `/auth/forgot-password`: one labelled email field, keyboard-reachable controls with visible focus, responsive light theme, no dark mode. Submit an empty/malformed value: en-US `role="alert"` validation and no request.
3. Submit the active email: button reads "Sending link…" while in flight, then the page stays put with exactly "If an account exists for that email, a password reset link has been sent." and a `/auth/sign-in` link; the HTTP response body is byte-identical.
4. Submit an unknown email and a `pending` email: identical 202 body and page text, no token row, no email.
5. Read the console fallback (or Mailtrap) email: subject "Reset your password", body links to `{APP_URL}/auth/reset-password?token={TOKEN}`, states one-hour expiry and says "If you didn't request this, you can ignore this email."
6. Inspect `password_reset_tokens`: exactly one row for the account with SHA-256 `token_hash`, no raw token, `used_at` null and `expires_at` about one hour after `created_at`; repeat the request inside 60 seconds — no second email, no new row and the original row unchanged.
7. After more than 60 seconds, submit again: one new email/row, and the previous unconsumed row now has non-null `used_at`. Force `EmailService` to throw: the new row is gone, the error is logged without the raw token/email, and the response is still the identical 202.
8. Run `npm run db:migrate` a second time and re-check `GET /`, `/`, sign-up, sign-in, confirmation and `/auth/me` — earlier contracts and the migrated table remain intact.

## Rollback

Revert the commit and remove the generated migration/metadata; Drizzle migrations are forward-only, so a deployed database would need the `password_reset_tokens` table manually dropped (or the volume restored). Tokens already emailed become unusable after rollback. No user data outside reset tokens is changed by this spec.

## Approval

- [ ] Approved by parent orchestrator/user — pending; this plan stops at the approval gate.
