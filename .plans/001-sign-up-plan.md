# Implementation plan — Sign-Up — Account Creation with Confirmation Email

- **Spec:** specs/001-sign-up.md
- **Status:** completed
- **Created:** 2026-11-24

## Objective

A visitor can open `/auth/sign-up`, submit first name, last name, email, password and matching confirmation, and receive HTTP 201 while a `pending` account and a hashed, expiring confirmation token are persisted and an en-US "Confirm your account" email is sent through an abstracted `EmailService`. `GET /` and the `/` hello-world page keep working, and the shared conventions (`/api/v1`, validation, layering, router shell, en-US docs) are in place for specs 002–006.

## Context loaded

- **AGENTS.md files read:** `AGENTS.md` (root, Turborepo rules), `.docs/AGENTS.md`. No nested `AGENTS.md` exists in `apps/api`, `apps/app`, `drizzle` or `packages` (verified with `find`).
- **Context pack read:** `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/RULES.md`, `.docs/QA.md`, `.docs/BUSINESS.md`, `.docs/DESIGN.md`, `.docs/DESIGN_SYSTEM.md`.
- **Skills loaded:** `implement-me`, `feature-concept` (readiness check only — spec unchanged), `tdd` (red/green at pre-agreed seams), `frontend-design` (design plan below). `shadcn` deliberately not loaded: the spec forbids shadcn/ui in this slice.
- **Verified in code/config:**
  - `apps/api/src/main.ts` has no prefix, pipe, CORS or config; `app.module.ts` registers only `AppController`; `app.controller.ts` returns `{"message":"Hello World"}` at `GET /`.
  - `apps/app/src/App.tsx` renders a single `<h1>Hello World</h1>`; `main.tsx` has no router; `App.test.tsx` renders `<App />` directly; `vite.config.ts` sets jsdom for Vitest.
  - `drizzle/schema.ts` is `export {}`; `drizzle/0000_initial.sql` is an empty placeholder; `_journal.json` has exactly one entry (`0000_initial`); `drizzle.config.ts` targets Postgres at `127.0.0.1:54322`.
  - No `vitest.config.*` in `apps/api`; `apps/api/test/app.spec.ts` creates the app with `NestFactory` directly.
  - `package.json` workspaces/scripts and `turbo.json` tasks are unchanged from foundation; Node `>=22`; root devDeps include `drizzle-orm`, `pg`, `vitest`, `supertest`.
  - None of `class-validator`, `class-transformer`, `@nestjs/config`, `bcrypt`, `nodemailer`, `react-router-dom`, `@types/pg` is installed yet. npm registry is reachable (`npm view react-router-dom version` → 7.18.7).
  - `@nestjs/common` `GlobalPrefixOptions` exposes `exclude`, so `setGlobalPrefix("api/v1", { exclude: [{ path: "", method: RequestMethod.GET }] })` can preserve `GET /`.
  - `apps/api/tsconfig.json` already enables `experimentalDecorators`/`emitDecoratorMetadata` and strict checks; ESLint config has no `no-console` rule.
- **Target items not yet implemented:** backend `interface`/`application`/`domain`/`infrastructure` layers, DB client and repositories, email boundary and adapters, client router, sign-up form, confirmation endpoint (003), sign-in (002), reset (004/005), route guard (006), Playwright E2E and application instrumentation.

## Decisions carried from the spec

- **D-1** class-validator + global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) — one validation surface reused by 002/004/005. ADR: not needed.
- **D-2** `EmailService` port with Mailtrap SMTP (non-production), Resend API (production) and console fallback on missing credentials — provider choice stays out of use cases and a clean checkout works without secrets. ADR: yes, in `.adrs/0002-sign-up-conventions.md`.
- **D-3** `users` with UUID key, lowercased unique email, `status` pending/active — stable identity, no sequential counts. ADR: not needed.
- **D-4** opaque confirmation token, SHA-256 hash only at rest, 24-hour expiry, single-use in 003 — clickable link without a signing secret. ADR: not needed.
- **D-5** `react-router-dom` shell with CSS variables from `DESIGN.md`, no shadcn — later specs need `/auth/*` and `/app/*`. ADR: not needed.
- **D-6** minimum 8 characters, no complexity rules, "check your inbox" success state. ADR: not needed.
- **D-7** duplicate email → generic 409, no resend. ADR: not needed.
- **D-8** email subject "Confirm your account" (prompt's "purchase" was a typo). ADR: not needed.
- **D-9** document en-US and `/api/v1` and record the email abstraction in an ADR in the same change (`.docs/RULES.md:23`). ADR: yes, same ADR as D-2.
- **D-10** failed email dispatch deletes the new account and token, then returns 502. ADR: not needed.
- **D-11** keep `/` hello world and add unguarded `/app/home`. ADR: not needed.
- **Pre-agreed test seams (from the spec, confirmed here before any test is written):** HTTP integration (Supertest + DI fakes), use-case unit (in-memory ports), client render (React Testing Library + jsdom), persistence (manual migration check), docs/ADR (manual review). Tests observe these seams only.

## Approach

Build the API slice first so the client consumes a real contract. A shared `configureApp()` applies the global prefix with a root-GET exclusion, the validation pipe and CORS; both `main.ts` and the HTTP tests call it so tests exercise production wiring. Ports are abstract classes in `domain`; a `UnitOfWork` port owns the transaction and hands transaction-scoped repositories to the use case, keeping application code free of Drizzle and making in-memory fakes straightforward. Email adapters live behind one port selected by `EMAIL_PROVIDER`/`NODE_ENV` with a console fallback. On the client, `BrowserRouter` provides `/`, `/auth/sign-up` and an unguarded `/app/home`; the sign-up form validates the password match locally, posts JSON and stays on the page with a success message. Docs, env example and ADR land with the code.

## Work breakdown (vertical slices)

### Slice 1 — Versioned API surface exists and the hello-world contract survives

- **Files:** `apps/api/package.json`; new `apps/api/src/setup.ts`, `apps/api/src/auth/auth.module.ts`, `apps/api/src/auth/interface/auth.controller.ts`, `apps/api/src/auth/interface/dto/sign-up-request.dto.ts`, `apps/api/src/auth/interface/dto/passwords-match.constraint.ts`; edit `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/test/app.spec.ts`; new `apps/api/test/sign-up.spec.ts`.
- **Seam / test:** Supertest against `AppModule` configured with `configureApp`, with `SignUpUseCase` faked via Nest DI override. Red tests first: valid body → 201 en-US body; mismatch/short/unknown field → 400; `GET /` → 200 hello world; `GET /api/v1` route prefix active.
- **Verification:** `npm run test -w api` after each red/green cycle.

### Slice 2 — Pending account, hashed password and hash-only confirmation token are persisted

- **Files:** `drizzle/schema.ts`; generated `drizzle/0001_sign_up.sql` + `drizzle/meta/0001_snapshot.json` + journal entry; new `apps/api/src/auth/domain/ports.ts`, `apps/api/src/auth/domain/tokens.ts`, `apps/api/src/auth/infrastructure/database.ts`, `apps/api/src/auth/infrastructure/unit-of-work.ts`, `apps/api/src/auth/infrastructure/account.repository.ts`, `apps/api/src/auth/infrastructure/confirmation-token.repository.ts`, `apps/api/src/auth/infrastructure/bcrypt-password-hasher.ts`, `apps/api/src/auth/application/sign-up.use-case.ts` and its unit spec.
- **Seam / test:** use-case unit with in-memory `UnitOfWork`, capturing hasher and deterministic token generator; asserts lowercased email, bcrypt hash, hash-only storage, `used_at = null` and `expires_at` ≈ +24h. HTTP integration maps a Postgres `23505` error to 409.
- **Verification:** `npm run test -w api`; `npx drizzle-kit generate --name=sign_up` and read the generated SQL; `npm run db:migrate` twice if local Postgres is available.

### Slice 3 — Confirmation email goes through the port and failures compensate

- **Files:** new `apps/api/src/auth/domain/email.ts`, `apps/api/src/auth/infrastructure/email/console.adapter.ts`, `mailtrap-smtp.adapter.ts`, `resend-api.adapter.ts`, `email-service.factory.ts`, adapter specs; edit `apps/api/src/auth/auth.module.ts` and `apps/api/src/auth/application/sign-up.use-case.ts`.
- **Seam / test:** capturing `EmailService` fake asserts subject "Confirm your account", `{APP_URL}/auth/confirm-account?token={TOKEN}` and en-US body; `ConsoleEmailAdapter` spec asserts full message plus fallback warning; HTTP integration with a throwing adapter asserts 502 and deletion of account+token.
- **Verification:** `npm run test -w api`.

### Slice 4 — Duplicate and error matrix is closed at the HTTP seam

- **Files:** extend `apps/api/test/sign-up.spec.ts`; small edits to `sign-up.use-case.ts` for unique-violation mapping.
- **Seam / test:** HTTP integration — case-insensitive duplicate → 409 with no email, short password/mismatch/unknown field → 400, adapter throw → 502; response bodies contain no password, token or internal id.
- **Verification:** `npm run test -w api`.

### Slice 5 — Public sign-up page and router shell

- **Files:** `apps/app/package.json`; edit `apps/app/src/main.tsx`, `apps/app/src/App.tsx`, `apps/app/src/App.test.tsx`, `apps/app/src/index.css`; new `apps/app/src/auth/sign-up/SignUpPage.tsx` and `SignUpPage.test.tsx`.
- **Design plan (frontend-design pass):** palette is pinned by `DESIGN.md` — `--linen` `#fff1e6` page, `--parchment` `#f0efeb` field surfaces, `--powder-blue` `#99c1de` primary action, `--pale-sky` `#bcd4e6` hover, `--alice-blue` `#d6e2e9` focus/support, `--light-cyan` `#c5dedd` success, `--soft-blush` `#fde2e4` errors, ink `#1b1b1b` text. Type: keep Georgia for the single display heading (continuity with foundation), use a system sans stack for labels/inputs/buttons — two clearly distinct roles. Layout: one left-aligned form column (max width ~30rem) on the linen field, a hairline rule under the heading, no card grid, no shadow kit, no ALL-CAPS eyebrow, no numbered markers, no arrows. Principles: quiet and legible, token-driven, errors as text plus border (never color alone), visible focus, reduced-motion friendly, mobile-first stacking, light theme only. Reviewed against the brief: the pinned pastel palette and the no-card layout keep it distinct from the generic SaaS form; no extra decoration is added.
- **Seam / test:** React Testing Library with `MemoryRouter` and mocked `fetch` — five labelled inputs in keyboard order, min-length hint, mismatch blocks the request with `role="alert"`, submitting label, success message and no navigation.
- **Verification:** `npm run test -w app`, `npm run build -w app`.

### Slice 6 — Docs, environment defaults and ADR

- **Files:** `.env.example`, `.docs/DEVELOPMENT.md`, `.docs/ARCHITECTURE.md`, `.docs/QA.md`, `README.md`, `.adrs/0002-sign-up-conventions.md`.
- **Seam / test:** manual review against AC-14 — en-US rule, `/api/v1` convention, all new variables, layered auth slice and the email-abstraction ADR are present; `GET /` probe stays in `.docs/QA.md`.
- **Verification:** `npx prettier --check "**/*.{ts,tsx,md}"`.

### Slice 7 — Full quality gate and delivery

- **Files:** none (verification only).
- **Seam / test:** all repository checks plus manual browser/API probes.
- **Verification:** `npm run lint`, `npm run check-types`, `npm run test`, `npm run build`, prettier check; infra probes only if Docker/Supabase are available, otherwise reported as skipped.

## Dependencies & additions

- `apps/api` dependencies: `class-validator`, `class-transformer`, `@nestjs/config`, `bcrypt`, `nodemailer` — DTO validation, env config, password hashing and Mailtrap SMTP. DevDeps: `@types/bcrypt`, `@types/nodemailer`.
- `apps/api` runtime deps `drizzle-orm` and `pg` plus devDep `@types/pg`: the API now uses Drizzle/Postgres at runtime, while the root copies remain for `drizzle-kit`. This is an addition beyond the spec's handoff list; it keeps a production install (`--omit=dev`) functional.
- `apps/app` dependency: `react-router-dom` — `/auth/*` and `/app/*` shell.
- `VITE_API_URL` (default `http://localhost:3000`) documented in `.env.example`: the SPA needs an API base URL; CORS remains configured for `http://localhost:5173`. This is one extra variable beyond the spec's list, flagged here for approval.
- Migration `drizzle/0001_sign_up.sql` generated with `drizzle-kit generate` (never renumber `0000_initial`).
- ADR `.adrs/0002-sign-up-conventions.md` covering D-2 and D-9. No Turborepo config or root script changes, so no new turbo documentation is required.

## Risks, assumptions & follow-ups

- Risk: dependency installation needs the npm registry. Verified reachable; mitigation is to install in slice 1 and report the exact error if it fails. No silent substitute library.
- Risk: `bcrypt` is a native module. If its prebuilt binary cannot install, stop and resolve with `feature-concept` instead of silently switching to `bcryptjs`.
- Risk: Drizzle's expression unique index on `lower(email)` may not generate as intended in `drizzle-kit 0.31.11`. Mitigation: read the generated SQL; fall back to a plain unique index on the already-lowercased value if needed.
- Risk: `setGlobalPrefix` exclusion must keep `GET /` at root. Mitigation: an explicit HTTP test in slice 1 (AC-15).
- Assumption resolved: local Docker/Supabase were available. `npm run infra:up` started the stack, `npm run db:migrate` succeeded twice and a temporary real-DB probe was run (then removed). Automated tests still use fakes and do not depend on infra.

## Implementation notes

- A real-DB probe exposed that Drizzle wraps driver errors in `DrizzleQueryError`; `isUniqueViolation()` now unwraps `cause` to detect SQLSTATE `23505`, with a deterministic unit test covering both wrapped and raw shapes.
- ESLint's `no-undef` rule was disabled for TypeScript files in both app configs: the Babel parser cannot resolve TS declarations or `import.meta` globals, while `check-types` already does.
- The temporary real-DB probe was deleted after verification; only deterministic tests remain in the repository.
- Deliberate follow-up: `/auth/confirm-account` is only a link target until 003; `/app/home` stays unguarded until 006; no sign-out, refresh, OAuth, MFA, shadcn, Playwright or instrumentation in this slice.
- Deliberate follow-up: `VITE_API_URL` may be replaced by a Vite proxy or deployment-specific config in a later slice; the dev default keeps this slice self-contained.

## ADR candidates

- Email abstraction (`EmailService` port + Mailtrap/Resend/console adapters) and the en-US + `/api/v1` conventions — one ADR, `.adrs/0002-sign-up-conventions.md`, required by D-2, D-9 and `.docs/RULES.md`.

## Quality checks (from QA.md)

- [x] `npm run lint` — pass
- [x] `npm run check-types` — pass
- [x] `npm run test` — pass (27 tests: 18 API, 9 client)
- [x] `npm run build` — pass; `apps/app/dist/**` present
- [x] `npx prettier --check "**/*.{ts,tsx,md}"` — pass
- [x] `npm run code:fix` — not needed; `npm run format` was used to fix formatting, then lint/check-types/test/build re-run
- [x] `npm run db:migrate` twice — pass after `npm run infra:up`; real Postgres probe confirmed lowercased unique email, bcrypt hash, hash-only token, 24h expiry, console fallback email and 409 on a case-variant duplicate

## Manual QA

1. `npm run dev`, then `curl http://localhost:3000/` → `200 {"message":"Hello World"}` and `curl http://localhost:3000/api/v1/does-not-exist` → JSON 404.
2. Open `http://localhost:5173/auth/sign-up` → five labelled fields, min-8 hint, visible focus, responsive layout, light theme only.
3. Submit mismatched passwords → inline `role="alert"` error and no network request.
4. Submit a valid form → button shows "Creating account…", then the page stays on `/auth/sign-up` with "Check your email to confirm your account."
5. Inspect the console fallback (no Mailtrap credentials) → full "Confirm your account" email with `{APP_URL}/auth/confirm-account?token={TOKEN}` and a fallback warning; no raw token in logs or database.
6. Inspect `users` and `account_confirmation_tokens` → lowercased email, bcrypt hash, status `pending`, token hash only, `used_at` null, `expires_at` ≈ +24h.
7. Repeat the same email with different case → 409 generic message and no second email; stop the email provider → 502 with no leftover `pending` account.
8. Open `/` → hello-world heading; open `/app/home` → hello-world placeholder, unguarded until 006.

## Rollback

Revert the commit and the `0001_sign_up` migration; remove the added dependencies from both manifests. `GET /`, `/` and the foundation contract are restored by the revert. Accounts already persisted as `pending` are not automatically removed by a code rollback; that is documented as a known limit.

## Approval

- [x] Approved by the user on 2026-11-24 — scope as written above, including the extra `drizzle-orm`/`pg`/`@types/pg` API deps and `VITE_API_URL`.
