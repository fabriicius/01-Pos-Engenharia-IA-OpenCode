# QA

> Quality gates for changes. Run applicable checks before declaring work complete.

## Current checks (implemented)

Run from repository root on Node `>=22` (verified on `v22.22.1`):

```sh
npm install           # installs api, app and three @repo/* workspaces
npm run lint          # ESLint 10 via Turborepo (all workspaces)
npm run check-types   # TypeScript checks via Turborepo
npm run types:check   # alias of check-types
npm run build         # Turbo build; Vite emits apps/app/dist/**
npm run test          # Vitest: API Supertest contract + client render
npm run code:fix      # mutating: eslint --fix + Prettier, non-cached Turbo task
npm run format        # Prettier write; use npx prettier --check for a non-mutating check
```

### Recommended order

1. `npm run lint`
2. `npm run check-types` (or `npm run types:check`)
3. `npm run test`
4. `npm run build` (assert `apps/app/dist/**` exists)
5. `npx prettier --check "**/*.{ts,tsx,md}"` (or `npm run format` to fix)
6. `npm run code:fix` only when you intend to rewrite files, then re-run `npm run lint`

ESLint + Prettier are the chosen lint/format stack (ADR 0001); OXLint/OXFmt were rejected and are not used here.

## Local infrastructure checks

Requires Docker and the pinned Supabase CLI devDependency (`npm install`). Copy `.env.example` to `.env` first.

```sh
npm run infra:up      # supabase start && docker compose up -d
npm run db:migrate    # drizzle-kit migrate (idempotent; run twice to verify)
npm run infra:down    # supabase stop && docker compose down (volumes preserved)
```

Probes after `infra:up`:

| Check                                                       | Expected                                                |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| `curl http://localhost:3000/`                               | `200 application/json` `{"message":"Hello World"}`      |
| `curl http://localhost:3000/api/v1/does-not-exist`          | JSON `404`, API still up                                |
| `curl http://localhost:5173/`                               | SPA shell; browser redirects to `/auth/sign-in`         |
| `curl http://localhost:5173/auth/sign-up`                   | Public sign-up form                                     |
| `curl http://localhost:5173/auth/sign-in`                   | Public sign-in form                                     |
| `curl http://localhost:5173/auth/confirm-account`           | Public confirmation page; no token consumed by GET      |
| `curl http://localhost:5173/auth/forgot-password`           | Public reset-request form                               |
| `curl http://localhost:5173/auth/reset-password`            | Public reset form; no token consumed by GET             |
| `curl http://localhost:5173/app/home`                       | SPA shell; browser redirects to sign-in without a token |
| `curl http://localhost:3100/ready`                          | Loki ready                                              |
| `curl http://localhost:3200/ready`                          | Tempo `ready`                                           |
| `curl http://localhost:9009/ready`                          | Mimir `ready`                                           |
| `curl -u admin:admin http://localhost:3002/api/health`      | Grafana database `ok`                                   |
| `curl -u admin:admin http://localhost:3002/api/datasources` | Loki, Tempo, Mimir present                              |
| `npx supabase status`                                       | Studio 54323, Postgres 54322                            |
| `docker compose ps`                                         | Four LGTM containers running                            |
| `docker volume ls` after `infra:down`                       | LGTM and Supabase volumes still present                 |

### Sign-up checks

After `npm run infra:up` and `npm run db:migrate` (with `npm run dev` running):

1. Open `/auth/sign-up` — five labelled fields in keyboard order, an 8-character hint, visible focus and no dark mode.
2. Submit mismatched passwords — an inline `role="alert"` message appears and no request is sent.
3. Submit valid values — the button reads "Creating account…" while in flight, then the page stays on `/auth/sign-up` with "Check your email to confirm your account."
4. With no credentials for the selected provider, stdout contains the fallback warning and the full "Confirm your account" message with an `{APP_URL}/auth/confirm-account?token={TOKEN}` link.
5. Inspect `users` and `account_confirmation_tokens` — lowercased email, bcrypt hash, status `pending`, token hash only, `used_at` null and `expires_at` about 24 hours after creation.
6. Repeat the same email in a different letter case — HTTP 409, no second account and no second email. The emailed link is consumed by the confirmation checks below (implemented in `003-confirm-account`).
7. Stop the email provider with credentials still configured — HTTP 502 and no leftover `pending` account.
8. Open `/` — it redirects to `/auth/sign-in`; open `/app/home` — it redirects to `/auth/sign-in` until a session exists (see route protection checks); `GET /` on the API keeps `{"message":"Hello World"}`.

### Confirmation checks

After `npm run infra:up`, `npm run db:migrate` and a fresh sign-up (console fallback prints the link when no email credentials are configured):

1. Open the emailed `{APP_URL}/auth/confirm-account?token={TOKEN}` link once — "Confirming your account…" appears, then the browser lands on `/app/home` with `localStorage.auth_token` set; `GET /api/v1/auth/me` with that token returns 200.
2. Inspect `users` and `account_confirmation_tokens`: status `active`, `used_at` non-null with unchanged `token_hash`, and `session_version` incremented by exactly one. One "A new session was created" email contains the UTC time and "If this wasn't you, change your password."
3. Open the same link again — "This confirmation link is invalid or has expired." with a link to `/auth/sign-up`; no second email and no further version increment.
4. POST an unknown token and a token whose `expires_at` is in the past to `/api/v1/auth/confirm-account` — the same generic 410 and no account changes. POST a body without `token` — 400 with en-US validation errors.
5. Fetch the page URL without following the POST (scanner prefetch simulation) — the account stays `pending`, the token stays unused and no notification is sent.
6. Force `EmailService` to throw — 502, `users.status` back to `pending`, `used_at` null, version restored, no usable token returned.
7. Optional real-SQL probe: `RUN_DB_PROBE=1 npm run test -w api` exercises the conditional claim/release and activation/restore against local Postgres; it is skipped when the env var is absent.

### Sign-in checks

After `npm run infra:up`, `npm run db:migrate` and a confirmed account (sign up and consume the confirmation link once as above):

1. Open `/auth/sign-in` — labelled email/password fields in keyboard order, visible focus, responsive light theme.
2. Submit valid credentials — the button reads "Signing in…" while in flight, then the browser lands on `/app/home` and `localStorage.auth_token` holds the JWT.
3. Read the console fallback (or Mailtrap) — one "A new session was created" email with a UTC timestamp and "If this wasn't you, change your password."
4. Sign in a second time from another browser profile; call `GET /api/v1/auth/me` with the first token (401) and the second (200) — only the last session is valid.
5. Try an unknown email, a wrong password and a `pending` account — the same generic 401 twice, 403 with confirmation guidance once; no email and no version change on failures.
6. Send a stale/expired/tampered token and no header to `/auth/me` — 401 with no account data.
7. Force an email failure by configuring a broken adapter — 502, `session_version` restored, no token returned.
8. Confirm `users.session_version` starts at 0, increases by exactly one per successful sign-in, and that `npm run db:migrate` remains idempotent.
9. Re-check `GET /` and a fresh sign-up — the earlier contracts still work.

### Forgot-password checks

After `npm run infra:up`, `npm run db:migrate` and a confirmed account (sign up and consume the confirmation link once as above):

1. Open `/auth/forgot-password` — one labelled email field, keyboard-reachable controls with visible focus, responsive light theme and no dark mode. Submit an empty or malformed value — en-US `role="alert"` validation and no request.
2. Submit the active email — the button reads "Sending link…" while in flight, then the page stays put with exactly "If an account exists for that email, a password reset link has been sent." and a `/auth/sign-in` link; the HTTP response body is byte-identical.
3. Submit an unknown email and a `pending` email — the same 202 body and page text, no token row and no email. Extra fields or a missing email return 400.
4. Read the console fallback (or Mailtrap) — one "Reset your password" email links to `{APP_URL}/auth/reset-password?token={TOKEN}`, states one-hour expiry and says "If you didn't request this, you can ignore this email."
5. Inspect `password_reset_tokens` — exactly one row for the account with SHA-256 `token_hash` (no raw token), `used_at` null and `expires_at` about one hour after `created_at`. Repeat inside 60 seconds — no second email, no new row and the original row unchanged.
6. After more than 60 seconds, submit again — one new email/row and the previous unconsumed row now has non-null `used_at`. Force `EmailService` to throw — the new row is gone, the error is logged without the raw token or email, and the response is still the identical 202.
7. Run `npm run db:migrate` a second time and re-check `GET /`, `/`, sign-up, sign-in, confirmation and `/auth/me`; earlier contracts and the migrated table remain intact.
8. Optional real-SQL probe: `RUN_DB_PROBE=1 npm run test -w api` exercises row selection, invalidation, removal, the partial unique index and the account row lock against local Postgres; it is skipped when the env var is absent.

### Reset-password checks

After `npm run infra:up`, `npm run db:migrate` and a confirmed account with a fresh reset link from the forgot-password checks above:

1. Open the emailed `{APP_URL}/auth/reset-password?token={TOKEN}` link — two labelled password fields in keyboard order, visible focus, a "Use at least 8 characters." hint, responsive light theme and no dark mode. Submit a short value and a mismatched pair — en-US `role="alert"` errors, no POST for the local validation, and no account changes.
2. Sign in first so `localStorage.auth_token` exists, then submit a valid pair — the button reads "Resetting password…" while in flight, the 200 body is exactly `{"message":"Your password has been reset."}` with no token or password, `auth_token` is removed and the browser lands on `/auth/sign-in`. Sign in with the new password and confirm the old password no longer works.
3. Inspect `users` and `password_reset_tokens`: `password_hash` verifies the new password and not the old one, `used_at` is non-null with an unchanged `token_hash`, and `session_version` increased by exactly one. Call `GET /api/v1/auth/me` with the pre-reset JWT — 401 with no account data; the new JWT returns 200.
4. Read the console fallback (or Mailtrap) — one "Your password has been reset" email with the UTC time and "If this wasn't you, reset it again immediately.", no token-bearing link and no other language.
5. Replay the link and POST an expired and an unknown token — all return the same 410 `"This password reset link is invalid or has expired."` with no second hash change, version increment or email. Open the page without `token` — the same message with a `/auth/forgot-password` link and no form. Submit a 400 shape (short password, mismatch, extra field) — an en-US message and no changes.
6. Force `EmailService` to throw for a fresh token — the previous `password_hash`, null `used_at` and `session_version` are restored, the response is a generic 502 with no success email, and the same link works when the provider recovers.
7. Confirm no raw token or plaintext password appears in responses or logs, run `npm run db:migrate` again, and re-check `GET /`, `/`, sign-up, sign-in, confirmation, forgot-password and `/auth/me`; earlier contracts remain intact.
8. Optional real-SQL probe: `RUN_DB_PROBE=1 npm run test -w api` now also exercises conditional token claim/release and guarded password/version write/restore against local Postgres; it is skipped when the env var is absent.

### Route protection checks

After `npm run infra:up`, `npm run db:migrate` and a confirmed account (sign up and consume the confirmation link once as above):

1. With `localStorage.auth_token` cleared, open `/app/home` — the browser redirects to `/auth/sign-in`, "Checking your session…" never renders a private page and no `Hello World` content appears. No `/auth/me` request is made without a token.
2. Sign in, then open `/app/home` — "Checking your session…" (`role="status"`) is visible while `GET /api/v1/auth/me` is in flight, then the unchanged hello-world placeholder renders. The request carries `Authorization: Bearer {TOKEN}` and the token never appears in console logs.
3. Open `/` — it still redirects to `/auth/sign-in` (ADR 0006); the API `GET /` still returns `{"message":"Hello World"}`. Do not restore a client hello-world page at `/`.
4. While signed in, open `/auth/sign-in` and `/auth/sign-up` — both redirect to `/app/home` before the forms render.
5. While signed in, open `/auth/confirm-account`, `/auth/forgot-password` and `/auth/reset-password` — each page renders without a redirect or an extra `/auth/me` call, so emailed confirmation/recovery links keep working. Use an invalid or dummy token when checking the confirmation page so no real link is consumed.
6. Sign in from a second browser profile, then reload `/app/home` in the first — the first token is rejected with 401, `auth_token` is cleared and the browser redirects to `/auth/sign-in` without private content. A password reset revokes earlier tokens the same way.
7. Stop the API (or block `localhost:3000`) with a token stored and open `/app/home` — "Unable to verify your session." (`role="alert"`) and a keyboard-reachable "Retry" button appear, and `auth_token` stays in `localStorage`. Restore the API, Tab to Retry (visible focus), press it — the page renders after a successful check.
8. Re-run `npm run db:migrate` and re-check `GET /`, `/`, sign-up, sign-in, confirmation, forgot-password, reset-password and `/auth/me`; earlier contracts and the client-only guard boundary remain intact.

## Hook checks

Lefthook is installed by the root `prepare` script (`npm install`).

- `printf 'feat: add foundation\n' | npx commitlint` → exit 0.
- `printf 'banana\n' | npx commitlint` → exit 1 (missing type/subject).
- With a staged source file, `npx lefthook run pre-commit` → lint-staged formats and lints it.
- A `commit-msg` with `banana` is rejected; a Conventional Commit is accepted.

## Target checks (not yet implemented)

| Target command     | Purpose                        | Status   |
| ------------------ | ------------------------------ | -------- |
| `npm run test:e2e` | Browser E2E tests (Playwright) | [target] |

## Reporting

When finishing a task, report:

- Commands run and their result (pass/fail/not available).
- Any checks skipped and why.
- Manual QA steps performed or required.

## API observability checks (spec 007)

```sh
npm run observability:test-alerts  # pinned promtool in Docker; isolated fixtures
npm run observability:verify       # all panel queries, provisioning and rule evaluation
npx eslint monitoring/*.mjs --max-warnings 0
docker compose config --quiet
docker run --rm -v "$PWD/monitoring/alloy.alloy:/etc/alloy/config.alloy:ro" grafana/alloy:v1.11.3 validate /etc/alloy/config.alloy
```

Automated coverage includes HTTP success/validation/guard/unexpected failure/unmatched-method attribution, exactly-once abort accounting, actual OTLP payload privacy, correlated dependency spans, preserved pg/email outcomes, console fallback and non-fatal metrics port conflicts. Alert fixtures exercise all seven actual rules with pending/firing/recovery, missing target, low/idle traffic and console-provider exclusion, without injecting series into the running stack.

Manual/live QA: open [API Observability](http://localhost:3002/d/fabricius-api-observability), inspect desktop/narrow layout, filters and empty states, expand a log and follow View trace, confirm read-only query spans, and restart Grafana/Alloy to verify stable resources without duplicates. See [OBSERVABILITY.md](OBSERVABILITY.md). Existing six opt-in DB mutation probes are skipped unless `RUN_DB_PROBE=1` is supplied.
