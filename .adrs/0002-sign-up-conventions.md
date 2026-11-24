# ADR 0002 — Email abstraction and shared sign-up conventions

- **Status:** accepted
- **Date:** 2026-11-24
- **Spec:** `specs/001-sign-up.md`
- **Decisions recorded:** D-2, D-9 (plus the implementation adjustments listed below)

## Context

`001-sign-up` is the first real feature after the hello-world foundation. It must send a clickable confirmation email from a clean checkout where no email credentials exist, while later specs (`002`–`005`) need to send session and password-reset emails through the same boundary. The repository also had no documented API versioning convention and no record of the en-US rule outside `.docs/DEVELOPMENT.md`. `.docs/RULES.md` requires an ADR for meaningful architectural decisions and requires documentation updates in the same change.

## Decision

### D-2 — One `EmailService` port with three adapters

- `apps/api/src/auth/domain/email.ts` defines `EmailMessage` and the abstract `EmailService` with a single `send(message)` method. Use cases depend on the port, never on a vendor SDK.
- `MailtrapSmtpEmailAdapter` uses Nodemailer and `MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USER`, `MAILTRAP_PASSWORD`, `MAILTRAP_FROM`.
- `ResendApiEmailAdapter` uses `fetch` against `https://api.resend.com/emails` with `RESEND_API_KEY` and `RESEND_FROM`; no SDK dependency is added.
- `ConsoleEmailAdapter` is the fallback. It logs a warning and prints the full message so a developer without credentials can read the confirmation link.
- `createEmailService(config)` selects the adapter: `EMAIL_PROVIDER` wins when it is `mailtrap` or `resend`; otherwise `mailtrap` in development/test and `resend` in production. If the selected provider's credentials are incomplete, the console adapter is used instead of failing startup.
- Rejected: Supabase local SMTP (the user chose Mailtrap), vendor calls inside the use case (couples logic to a provider) and fail-fast on missing credentials (blocks a clean checkout).
- Consequence: the console fallback intentionally writes the email body — including the confirmation link — to stdout; application logs never emit the raw token separately, and neither the database nor an API response contains it.

### D-9 — Document en-US, `/api/v1` and the email decision in the same change

- All API routes are mounted under the global `api/v1` prefix by `configureApp()`; only the foundation `GET /` is excluded so its contract remains unchanged.
- `.docs/DEVELOPMENT.md`, `.docs/ARCHITECTURE.md`, `.docs/QA.md` and `README.md` record the versioned prefix, the new environment variables and the auth layering.
- `.env.example` gains `APP_URL`, `VITE_API_URL`, `EMAIL_PROVIDER`, the Mailtrap variables and the Resend variables, all marked local-only.
- This ADR records the email abstraction. Deferring any of this to a later spec was rejected because the docs are the reviewer's source of truth.

### Implementation adjustments (not separate architectural decisions)

- `drizzle-orm`, `pg` and `@types/pg` were added to `apps/api` in addition to the spec's dependency list so a production install (`--omit=dev`) can run the repositories.
- `VITE_API_URL` (default `http://localhost:3000`) was added to `.env.example` so the SPA can reach the API without a build-time proxy.
- `no-undef` is disabled for TypeScript files in both app ESLint configs. ESLint's JavaScript rule cannot understand TS type declarations or `import.meta` globals; `check-types` already covers undefined identifiers.
- The Drizzle table definitions live in `apps/api/src/auth/infrastructure/schema.ts` and are re-exported by `drizzle/schema.ts`, the path read by `drizzle-kit`. This keeps the API build's `rootDir: ./src` intact while preserving one migration source of truth.
- Drizzle wraps driver errors in `DrizzleQueryError`; `isUniqueViolation()` unwraps `cause` to find SQLSTATE `23505` so a real duplicate still maps to HTTP 409 (verified against local Postgres).

## Consequences

- Positive: use cases stay provider-agnostic; later specs reuse the port and the adapter matrix.
- Positive: a clean checkout can complete sign-up and read the link without secrets; production defaults to Resend.
- Positive: `/api/v1` is established once in `configureApp()` and shared by tests and runtime, so tests exercise the real wiring.
- Negative: the console fallback exposes a confirmation link in local stdout. That is deliberate for local QA and must not be enabled in production with real accounts; the fallback warning makes the condition visible.
- Negative: adding a new provider requires a new adapter and a branch in `createEmailService`.
- Follow-up: `003-confirm-account` consumes the token; `006-route-protection` guards `/app/*`.

## Verification

- `npm run test` → API HTTP/use-case/adapter seams and client render seams pass.
- `npm run check-types`, `npm run lint`, `npm run build`, `npx prettier --check "**/*.{ts,tsx,md}"` pass.
- `npx drizzle-kit generate --name=sign_up` produced `drizzle/0001_sign_up.sql` with `lower("email")` as a unique index.
- Sign-up without credentials prints the warning and the full "Confirm your account" message; a throwing adapter returns 502 after compensating the persisted rows.
