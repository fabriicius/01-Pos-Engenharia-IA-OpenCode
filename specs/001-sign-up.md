# Sign-Up — Account Creation with Confirmation Email

- **Spec:** 001-sign-up
- **Status:** ready-for-implementation
- **Created:** 2026-11-24
- **Last updated:** 2026-11-24
- **Source:** feature-concept session (delegated by create-spec from the approved authentication breakdown)

## Problem & motivation

Visitors of the expert platform cannot create an account. Today `apps/api` exposes only `GET /` (`apps/api/src/app.controller.ts`), `apps/app` renders a single `<h1>Hello World</h1>` (`apps/app/src/App.tsx`), `drizzle/schema.ts` is empty, there is no API prefix, no DTO validation, no router and no email boundary. The observable signal that this is fixed: a visitor opens `/auth/sign-up`, submits first name, last name, email, password and matching confirmation, receives HTTP 201, a `pending` account is persisted, and a "Confirm your account" email carries a tokenized link to `/auth/confirm-account` — while the existing `GET /` contract and the hello-world page stay unchanged.

This spec also lays down the shared conventions the later authentication specs inherit: `/api/v1` versioning, validation, persistence, routing shell, email abstraction and the en-US documentation rule.

## Goals / non-goals

- **Goals:**
  - Add `POST /api/v1/auth/sign-up` with first name, last name, email, password and password confirmation; password and confirmation must match.
  - Persist a `pending` account with a hashed password, a case-insensitively unique email and a hashed, expiring, single-use confirmation token.
  - Send an en-US "Confirm your account" email containing a clickable `{APP_URL}/auth/confirm-account?token={TOKEN}` link through an `EmailService` port with Mailtrap (SMTP), Resend (API) and console-fallback adapters.
  - Add the public `/auth/sign-up` page with accessible, responsive, en-US form states and a "check your inbox" success state.
  - Establish the shared conventions for the initiative: global `/api/v1` prefix, `ValidationPipe` with class-validator, Drizzle users/token tables and migration, client router shell for `/auth/*` and `/app/*`, documentation of en-US and versioning in `.docs/*` plus an ADR.
- **Non-goals:**
  - Confirming the account, consuming the token or creating a session — owned by `003-confirm-account`.
  - Sign-in, credential checking or the one-active-session policy — owned by `002-sign-in`.
  - Password recovery request, reset page or reset token consumption — owned by `004-forgot-password` and `005-reset-password`.
  - Enforcing the public/private route guard and redirecting unauthenticated visitors — owned by `006-route-protection`.
  - Introducing shadcn/ui, design tokens beyond CSS variables from `.docs/DESIGN.md`, Playwright E2E or production deployment.
- **Explicitly out of scope:**
  - Sign-out, session refresh/rotation, OAuth/social login, MFA, email change, account deletion and rate limiting beyond framework defaults — out of scope for this initiative because they were not requested.
  - Expert, connector, task and artifact features from `.docs/BUSINESS.md` — unrelated to authentication.
  - Real purchase/checkout flow — out of scope; "confirmacao de compra" in the source prompt was confirmed as account confirmation wording.

## Users & jobs to be done

- **Visitor / future product user:** create an account with their name and email so they can later confirm it and access the platform; needs a clear, accessible form and a confirmation email they can act on.
- **Developer / reviewer:** verify from a clean checkout that the sign-up contract, email link and documentation work without improvising configuration.
- **Not served:** returning users (002), users who forgot their password (004/005) and operators of protected pages (006). No expert/connector/task interaction exists in this spec.

## Domain model & vocabulary

- **Account:** the persisted registration record for one email address. It starts with status `pending` and becomes `active` only in `003-confirm-account`. Invariant: one account per normalized email address.
- **Email address:** stored lowercased with a unique index; the submitted display value is not required to be preserved.
- **Password hash:** the only persisted form of the password. Invariant: plaintext passwords never reach the database, logs or API responses.
- **Password confirmation:** a transport-only value used to detect typos; it is validated but never persisted.
- **Confirmation token:** a cryptographically random opaque value sent in the email link. Invariant: only its hash is persisted; it expires after 24 hours and is single-use. `003-confirm-account` owns consumption.
- **EmailMessage / EmailService:** a transport-agnostic message and the port that sends it. Adapters: `MailtrapSmtpEmailAdapter` (non-production), `ResendApiEmailAdapter` (production), `ConsoleEmailAdapter` (fallback).
- No concepts from `.docs/BUSINESS.md` (source/connector, normalized knowledge, expert, task/request, artifact/output) are introduced. The product-level "User" from `.docs/BUSINESS.md` is the future actor; this spec only creates the authentication identity for that actor. Do not conflate Account with Expert or with a session.
- All identifiers, route names, endpoint paths and UI text use en-US per `.docs/DEVELOPMENT.md:44`.

## Scope in code

- **[current, unchanged]** `apps/api/src/main.ts` — add `setGlobalPrefix("api/v1")`, `useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))`, CORS for the client origin and `@nestjs/config` usage; keep port 3000.
- **[current, unchanged]** `apps/api/src/app.module.ts` and `apps/api/src/app.controller.ts` — keep `GET /` returning `{"message":"Hello World"}`; add the auth module alongside, not inside, the hello-world controller.
- **[target]** `apps/api/src/auth/interface/` — `AuthController` with `POST /auth/sign-up`, `SignUpRequestDto` with class-validator decorators including password/confirmation match, and response mapping.
- **[target]** `apps/api/src/auth/application/` — `SignUpUseCase` owning token generation, transactional persistence, email dispatch and compensation on failure.
- **[target]** `apps/api/src/auth/domain/` — `Account`, `EmailAddress`, `PasswordHash`, `ConfirmationToken` and the `EmailService` port.
- **[target]** `apps/api/src/auth/infrastructure/` — Drizzle repositories for accounts and confirmation tokens, plus the three email adapters selected by environment configuration.
- **[target]** `drizzle/schema.ts` — `users` and `account_confirmation_tokens` tables; a new migration after `drizzle/0000_initial.sql`. `drizzle.config.ts` and `npm run db:migrate` stay the migration path.
- **[target]** `apps/app/src/main.tsx` and `apps/app/src/App.tsx` — add `react-router-dom`; keep `/` rendering the existing hello world, add `/auth/sign-up`, and reserve `/app/home` as an unguarded placeholder for `006-route-protection`.
- **[target]** `apps/app/src/auth/sign-up/` — form component, client-side match check and CSS variables from `.docs/DESIGN.md` in the app stylesheet.
- **[target]** `.env.example`, `.docs/DEVELOPMENT.md`, `.docs/ARCHITECTURE.md`, `README.md` and `.adrs/` — document the new environment variables, the en-US rule, the `/api/v1` convention and the email abstraction decision in the same change (`.docs/RULES.md:23`).
- **[current, unchanged]** `packages/ui`, `packages/eslint-config`, `packages/typescript-config`, `turbo.json`, `docker-compose.yml` and the LGTM stack.

## Behavior

### Happy path

1. A visitor opens `http://localhost:5173/auth/sign-up` and sees five labelled fields: first name, last name, email, password and confirm password.
2. The visitor fills them, with password and confirmation matching and at least 8 characters, and submits.
3. The client checks the match locally, shows a submitting state and sends `POST /api/v1/auth/sign-up` with the five JSON fields.
4. The API validates the payload, lowercases the email, hashes the password, generates an opaque confirmation token and stores only its hash with a 24-hour expiry inside one transaction; the account status is `pending`.
5. The use case asks `EmailService` to send "Confirm your account" to the submitted email with a link to `{APP_URL}/auth/confirm-account?token={TOKEN}`.
6. The API responds HTTP 201 with a short en-US acknowledgement containing no password, token or internal identifier.
7. The page stays on `/auth/sign-up` and shows "Check your email to confirm your account." The token itself is consumed only by `003-confirm-account`.

### Edge cases & failure modes

- **Empty / single / very large data:** there is no list or bulk endpoint. Empty fields are rejected by DTO validation (400). A single account per email is the maximum cardinality; there is no pagination. Very large payloads are bounded by framework defaults; no special limit is added here.
- **Stale / missing / untrusted data:** malformed email, blank names, short password and password/confirmation mismatch return 400 with en-US field errors. Unknown JSON fields are rejected (`forbidNonWhitelisted`). A missing `APP_URL` falls back to `http://localhost:5173`. Missing provider credentials select the console fallback with a warning; a missing database connection is an operator failure surfaced as a 500, never as a silent success.
- **Duplicate submit / retries / concurrency / idempotency:** there is no idempotency key. A duplicate email in any letter case returns 409 and creates no second account; a concurrent duplicate hits the unique index and is mapped to the same 409. Re-submitting after success returns 409. The confirmation token is single-use in `003-confirm-account`; a repeated submit does not produce a second email.
- **Recoverable vs operator-only failures:** mismatch, short password and duplicate email are user-fixable with inline/API errors. An email adapter exception is compensated by deleting the freshly created account and token, then returning 502 with a generic en-US message so no `pending` account is left without a confirmation email. An unreachable database or misconfigured SMTP endpoint with credentials present is operator-only and surfaces the underlying error in logs.
- **Email content:** the email subject is "Confirm your account". No purchase/checkout wording is used because no purchase concept exists in `.docs/BUSINESS.md`.

### Loading, empty & offline states

- While the request is in flight the submit button is disabled and labelled "Creating account…"; no duplicate submission is possible from the UI.
- Field errors appear inline next to the offending field and remain after a failed submit so the user can correct them without reloading.
- If the network is unavailable, the form shows a generic en-US "Unable to create account. Please try again." message with a retry via the same button.
- No empty-list, skeleton or offline-cache state exists because sign-up has no data listing.

## UX & accessibility

- Entry point: `/auth/sign-up`; `/` keeps the foundation hello-world heading. `/auth/*` is a public route shell and `/app/*` is reserved but not yet guarded (006).
- Keyboard path: first name → last name → email → password → confirm password → submit; visible focus on every control; DOM order matches visual order.
- Labels are persistent (not placeholder-only); `autocomplete` uses `given-name`, `family-name`, `email` and `new-password`; the password field has an accessible minimum-length hint.
- Errors are associated with their fields, announced through `role="alert"`/`aria-describedby`, and signalled by text and icon, never by color alone (`.docs/DESIGN.md:34`).
- Responsive from mobile to desktop; light theme only; semantic form and heading structure; no dark mode.
- Styling uses CSS variables mapped to the pastel palette in `.docs/DESIGN.md`. shadcn/ui and `@repo/ui` components are deliberately not introduced in this spec (`.docs/DESIGN_SYSTEM.md` remains target).

## Technical approach

- **Architecture and layer ownership:** follow the target layering in `.docs/DEVELOPMENT.md:28-35` with vertical slices under `apps/api/src/auth/`: `interface` (controller, DTOs), `application` (`SignUpUseCase`, transaction boundary), `domain` (entities/value objects, `EmailService` port), `infrastructure` (Drizzle repositories, email adapters). The NestJS skeleton has no layers yet, so this spec creates them for auth only. CORS allows the client origin (`http://localhost:5173`) to call port 3000.
- **Public seam / interface:** `POST /api/v1/auth/sign-up` accepting `{ firstName, lastName, email, password, confirmPassword }` and returning 201/400/409/502 with en-US JSON. The confirmation link is `/auth/confirm-account?token={TOKEN}` on the client. `GET /` remains unchanged.
- **Data flow, persistence, and source traceability:** `users` has `id uuid` primary key, `first_name`, `last_name`, `email` (lowercased, unique), `password_hash`, `status` (`pending` | `active`), `created_at`. `account_confirmation_tokens` has `id uuid`, `user_id` foreign key, `token_hash` unique, `expires_at`, `used_at` (nullable), `created_at`. The token is generated with `crypto.randomBytes(32).toString("base64url")` and stored as a SHA-256 hash; the raw token exists only in the email link. No product connector or source traceability is involved.
- **External boundaries and adapters (do not assume a connector exists):** `EmailService` exposes a single `send(message: EmailMessage)` method. `EMAIL_PROVIDER` selects `mailtrap` by default in development/test and `resend` in production; when the selected provider's credentials are absent the `ConsoleEmailAdapter` logs the full en-US message and a warning instead. Mailtrap uses SMTP via Nodemailer (`MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USER`, `MAILTRAP_PASSWORD`, `MAILTRAP_FROM`); Resend uses its HTTP API via `fetch` (`RESEND_API_KEY`, `RESEND_FROM`). `APP_URL` sets the client base URL of the confirmation link. No Google/Notion/Jira connector is touched.
- **Security, privacy, and observability:** bcrypt hashes passwords (cost 10–12); DTO validation whitelists fields; plaintext passwords, raw tokens and provider secrets are never logged or returned. The 409 for an existing email is generic and does not reveal account status. A warning is logged whenever the console fallback is used. Application instrumentation (LGTM) remains a later initiative.
- **Migration, rollout, flag, and rollback:** add a Drizzle migration after `drizzle/0000_initial.sql`; no feature flag and no backfill. Rollback reverts the commit and the migration; persisted `pending` accounts are not automatically rolled back. `.env.example` gains the new variables with development-only defaults and an explicit warning against production reuse.

## Decisions

- **D-1 — Validate with class-validator and a global `ValidationPipe`:** Nest-standard DTO validation with `whitelist`, `forbidNonWhitelisted` and `transform` covers field presence, email format, minimum length and password match in one place, reusable by 002/004/005. Rejected: hand-rolled validators (divergence risk); Zod (less idiomatic in Nest, needs an adapter). ADR: no. Verified by: `apps/api/package.json` (no validator installed), `apps/api/src/main.ts` (no pipe).
- **D-2 — `EmailService` port with Mailtrap SMTP in non-production, Resend API in production and console fallback:** keeps provider choice out of use cases and lets local QA work without credentials, as requested. Rejected: Supabase local SMTP (user chose Mailtrap); direct provider calls in the use case (couples logic to vendor); fail-fast on missing credentials (would block a clean checkout). ADR: yes. Verified by: `supabase/config.toml` `[local_smtp]`, user decision in interview round 2.
- **D-3 — `users` table with UUID key and case-insensitive unique email, `status` pending/active:** stable identity without exposing sequential counts; separate name fields as the prompt requires. Rejected: serial primary key; splitting identity and credentials into two tables now. ADR: no. Verified by: empty `drizzle/schema.ts`, `.docs/ARCHITECTURE.md:57`.
- **D-4 — Opaque confirmation token, hash-only storage, 24-hour expiry, single-use:** fits the clickable-link requirement and avoids a signing secret; `003-confirm-account` consumes it. Rejected: signed JWT (revocation needs state); 6-digit OTP (prompt requires a link). ADR: no. Verified by: source prompt, user decision in interview round 1.
- **D-5 — `react-router-dom` shell plus CSS variables from `DESIGN.md`, no shadcn yet:** later specs need `/auth/*` and `/app/*` paths; plain semantic components keep this slice reviewable. Rejected: shadcn now (scope growth); manual `location.pathname` routing (duplicated per spec). ADR: no. Verified by: `apps/app/src/main.tsx`, `apps/app/package.json`, `.docs/DESIGN_SYSTEM.md:9`.
- **D-6 — Minimum 8 characters without complexity rules, "check your inbox" success state:** usable first sign-up and clear about the next step; confirmation happens in 003. Rejected: Supabase's 6-character default; upper/lower/digit requirement (extra friction). ADR: no. Verified by: `supabase/config.toml` `minimum_password_length = 6`, user decision in interview round 2.
- **D-7 — Duplicate email returns a generic 409 without resending the confirmation:** avoids state disclosure and repeated automated sends. Rejected: 202 resend (abuse vector); 409 with status details (enumeration). ADR: no. Verified by: user decision in interview round 2.
- **D-8 — Email subject "Confirm your account":** "purchase" has no meaning in the product domain and was confirmed as a prompt typo. Rejected: literal "purchase confirmation"; neutral "Your access link". ADR: no. Verified by: `.docs/BUSINESS.md`, user decision in interview round 2.
- **D-9 — Document en-US and `/api/v1` and record the email abstraction in an ADR in the same change:** required by `.docs/RULES.md:23` and `.docs/AGENTS.md` rule 3. Rejected: deferring docs to a later spec. ADR: yes. Verified by: `.docs/DEVELOPMENT.md:44`, source prompt.
- **D-10 — Compensate a failed email dispatch by deleting the new account and token, then return 502:** prevents orphan `pending` accounts that can never be confirmed from this flow. Rejected: leaving the account pending and logging only (dead account); sending the email before persisting (no token to send). ADR: no. Verified by: decision recorded in this session.
- **D-11 — Keep `/` hello world and add an unguarded `/app/home` placeholder:** preserves the `000-foundation` AC-3 contract while giving 006 a route to protect. Rejected: moving hello world immediately (would break a committed acceptance criterion). ADR: no. Verified by: `specs/000-foundation.md:130`, `apps/app/src/App.tsx`.

## Test strategy & seams

- **HTTP integration seam (Vitest + Supertest against `AppModule`, with repository/email fakes via Nest DI override):** catches validation status codes, the 409 mapping, generic response shape and the 502 compensation path. Misses real socket binding and real SMTP. Independent source of truth: the status codes and literals in AC-1, AC-5, AC-6, AC-7, AC-10.
- **Use-case unit seam (Vitest, in-memory repository and capturing `EmailService` fake):** catches lowercasing, hashing, token-hash-only persistence, 24-hour expiry, link construction and rollback on adapter failure. Misses Drizzle/SQL correctness. Source of truth: D-3, D-4 and AC-2, AC-3, AC-4, AC-9.
- **Client render seam (Vitest + React Testing Library, jsdom):** catches the five labelled fields, en-US text, accessible errors, submitting state and success message. Misses real responsive layout and visual focus. Source of truth: AC-11, AC-12, AC-13.
- **Persistence seam (manual, `npm run db:migrate` twice with local Supabase):** catches an inapplicable or non-idempotent migration and the unique index; automated tests do not require a running database because repositories are faked. Source of truth: D-3 and the Drizzle migration journal.
- **Docs/ADR seam (manual review):** catches missing en-US/`/api/v1` documentation or the missing ADR; no automated check is added. Source of truth: AC-14.

## Acceptance criteria

- [ ] AC-1 — Given the API is running with infrastructure up, when `POST /api/v1/auth/sign-up` receives valid `firstName`, `lastName`, `email`, `password` and matching `confirmPassword`, then the response is HTTP 201 with a short en-US acknowledgement and no password, raw token or internal identifier in the body.
- [ ] AC-2 — Given a successful sign-up, when the `users` table is inspected, then the row has a UUID id, a lowercased unique email, the submitted first and last name, a `password_hash` different from the submitted password and status `pending`.
- [ ] AC-3 — Given a successful sign-up, when the produced email is inspected, then its subject is "Confirm your account", its body contains `{APP_URL}/auth/confirm-account?token={TOKEN}` with a non-empty opaque token, and every user-facing string is en-US.
- [ ] AC-4 — Given the token from AC-3, when `account_confirmation_tokens` is inspected, then only a hash of the token is stored, `used_at` is null, `expires_at` is about 24 hours after creation, and the raw token appears in neither the database nor the logs.
- [ ] AC-5 — Given `confirmPassword` differs from `password`, when `POST /api/v1/auth/sign-up` is called, then the API returns HTTP 400 with an en-US password-mismatch error and no account or email is created.
- [ ] AC-6 — Given a password shorter than 8 characters, when `POST /api/v1/auth/sign-up` is called, then the API returns HTTP 400 and no account is created.
- [ ] AC-7 — Given an account exists for `user@example.com`, when sign-up is attempted for `USER@EXAMPLE.COM`, then the API returns HTTP 409 with a generic en-US message, no second account is created and no confirmation email is sent.
- [ ] AC-8 — Given a request body with an unknown JSON field, when `POST /api/v1/auth/sign-up` is called, then the API returns HTTP 400 and no account is created.
- [ ] AC-9 — Given Mailtrap credentials are absent in development, when a valid sign-up is submitted, then the console receives the full "Confirm your account" message and a fallback warning, and the account is created with status `pending`.
- [ ] AC-10 — Given the selected email adapter throws, when a valid sign-up is submitted, then the newly created account and token are removed, the API returns HTTP 502 with a generic en-US message and no `pending` account remains without a confirmation email.
- [ ] AC-11 — Given a browser opens `/auth/sign-up`, then the page shows five labelled inputs in keyboard order with an en-US minimum-length hint, visible focus, responsive layout and no dark mode.
- [ ] AC-12 — Given the visitor types mismatched passwords in the form, when the form is submitted, then an inline `role="alert"` error is announced and no API request is sent.
- [ ] AC-13 — Given the visitor submits valid values, when the request succeeds, then the button shows a submitting state and the page stays on `/auth/sign-up` showing "Check your email to confirm your account."
- [ ] AC-14 — Given the change is committed, when a reviewer reads `.docs/DEVELOPMENT.md`, `.docs/ARCHITECTURE.md`, `README.md` and `.adrs/`, then the en-US rule, the `/api/v1` convention, the new environment variables and the `EmailService` decision are documented, with an ADR for the email abstraction.
- [ ] AC-15 — Given `/` is opened after the change, then the hello-world heading and `GET /` JSON contract from `000-foundation` still work, while `/auth/sign-up` and an unguarded `/app/home` route exist.

## Open questions & assumptions

None — every branch was resolved by an explicit user decision in the two feature-concept rounds, an accepted recommendation or a verified repository fact. Deliberate deferrals are recorded under Goals / non-goals and in the handoff below.

## Handoff to implement-me

- **Constraints:** do not implement token confirmation, sessions, sign-in, password reset or the route guard — those belong to 002–006. Keep `GET /` and the `/` hello-world page unchanged. Do not add shadcn/ui or Playwright. Add the ADR and the `.docs/*`/`README.md` updates in the same change.
- **Dependencies to add:** in `apps/api`: `class-validator`, `class-transformer`, `@nestjs/config`, `bcrypt` (+ `@types/bcrypt`), `nodemailer` (+ `@types/nodemailer`); in `apps/app`: `react-router-dom`. Resend is called through `fetch`, so no SDK is required. Keep all existing quality scripts and `@repo/*` packages intact.
- **Environment variables:** `APP_URL` (default `http://localhost:5173`), `MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USER`, `MAILTRAP_PASSWORD`, `MAILTRAP_FROM`, `RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_PROVIDER` (overrides the environment-based default). Document them in `.env.example` as development-only unless in production configuration.
- **Temporary behavior:** with no provider credentials the console adapter is active by design; `/app/home` is a placeholder with no guard until 006; the confirmation link target `/auth/confirm-account` is not implemented until 003.
- **Follow-ups for later specs:** 002-sign-in (session policy), 003-confirm-account (token consumption and session creation), 004-forgot-password, 005-reset-password, 006-route-protection, plus the deferred sign-out/refresh/OAuth/MFA items.
- **Manual QA data:** API on 3000, client on 5173, Supabase Postgres on 54322; `npm run db:migrate` then `npm run test`, `npm run lint`, `npm run check-types`, `npm run build`; submit a valid sign-up and read the email in the console fallback or in the configured Mailtrap inbox; follow the link only after 003 is implemented; confirm AC-14 by reading the docs and the new ADR.
