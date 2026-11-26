# Development

> Engineering standards for code changes. Distinguish **[current]** repo behavior from **[target]** architecture.

## Principles

- **DRY / avoid premature abstraction**: reuse logic when it reduces real duplication; avoid WET copy-paste.
- **Clean code**: clear naming, small focused units, readable control flow.
- **SOLID**: apply where it improves maintainability; do not over-engineer simple code.
- **Consistency**: follow existing patterns in the touched workspace before introducing new ones.

## Current repository practices

- Monorepo managed by npm workspaces + Turborepo; Node `>=22`.
- Apps: `apps/api` (NestJS API on port 3000: `GET /` hello world plus versioned sign-up/sign-in/confirm-account/forgot-password/`me` endpoints) and `apps/app` (React + Vite client on port 5173: `/` redirects to `/auth/sign-in`, plus `/auth/sign-up`, `/auth/sign-in`, `/auth/confirm-account`, `/auth/forgot-password`, `/auth/reset-password` and guarded `/app/*`).
- Shared packages: `@repo/ui`, `@repo/eslint-config`, `@repo/typescript-config`.
- Lint with ESLint 10 and format with Prettier; `npm run code:fix` runs both with `--fix`/write. OXLint/OXFmt are not used (ADR 0001). For TypeScript files, ESLint's `no-undef` rule is disabled because `check-types` resolves identifiers and globals more accurately than the Babel parser (ADR 0002).
- Type-check with TypeScript through `npm run check-types` or its alias `npm run types:check`.
- Test with Vitest (`npm run test`); the API uses Supertest against `AppModule` plus use-case unit tests with in-memory ports, the client uses React Testing Library in jsdom.
- Local infra: `npm run infra:up` (Supabase + LGTM), `npm run db:migrate`, `npm run infra:down`. Copy `.env.example` to `.env` first.
- API dev uses `tsc --watch` + `node --watch-path=dist` via `apps/api/dev.mjs`; do not replace it with `tsx`, which drops the decorator metadata Nest needs for DI and DTO validation (D-16).
- Hooks: Lefthook runs lint-staged on `pre-commit` and Commitlint on `commit-msg`; use Conventional Commits.
- Before declaring work done, run applicable checks from `QA.md`.

## Target architecture guidelines

Apply these when the relevant modules exist; do not force them into unrelated starter code.

### Backend layering (target: Nest.js API)

- `interface`: HTTP/controllers/DTO validation/transport mapping.
- `application`: use cases, orchestration, transaction boundaries.
- `domain`: entities, value objects, domain services, business rules.
- `infrastructure`: DB/repositories, external APIs, messaging, queues, adapters.

The four layers are implemented for the auth slice under `apps/api/src/auth/` (`interface`, `application`, `domain`, `infrastructure`); the hello-world controller remains outside that slice. The database client and repositories use Drizzle/Postgres, and the email port is implemented by Mailtrap, Resend and console adapters (ADR 0002).

### Vertical slices

- Organize by domain/capability (`experts`, `connectors`, `tasks`, `artifacts`, etc.).
- Keep shared code in a deliberate `shared` area only when truly cross-cutting.

## API conventions

- All new endpoints are mounted under the global `api/v1` prefix by `apps/api/src/setup.ts`; `GET /` is the sole exclusion and keeps the foundation contract. Client code calls `${VITE_API_URL}/api/v1/...`.
- Request bodies are validated by a global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted` and `transform`; unknown fields return 400.
- Email is sent through the `EmailService` port. `EMAIL_PROVIDER` selects `mailtrap` by default in development/test and `resend` in production; missing credentials select the console fallback. `APP_URL` builds confirmation and reset links (no new environment variable). See `.env.example` and ADR 0002.
- Sessions are HS256 JWTs carrying `sub` and a `ver` claim matched against `users.session_version`. The counter is incremented atomically on each sign-in and on password reset, so the last login wins and a reset revokes every earlier token; `GET /api/v1/auth/me` validates the token and version. `JWT_SECRET` signs tokens (development-only default in `.env.example`, mandatory in production). CORS allows the `Authorization` header; see ADR 0003.
- `POST /api/v1/auth/confirm-account` accepts `{ token }` in the body, never in a URL: the emailed link stays `{APP_URL}/auth/confirm-account?token={TOKEN}` and the page POSTs the query token once. Success activates the account, increments `session_version`, returns the 002 session shape and sends the same "A new session was created" email. Unknown, expired, used and already-active tokens all return the same generic 410; there is deliberately no self-service resend endpoint in this initiative (ADR 0004).
- `POST /api/v1/auth/forgot-password` accepts `{ email }` and returns the identical 202 message for active, unknown, `pending` and throttled addresses. Only an active account gets a one-hour hashed reset token and a "Reset your password" email. The cooldown comes from `password_reset_tokens.created_at` (60 seconds), a new request invalidates older unconsumed rows in the same transaction, and a failed dispatch deletes the new row without changing the response (ADR 0005).
- `POST /api/v1/auth/reset-password` accepts `{ token, password, confirmPassword }` in the body: the token is never in the API URL. The minimum-8/match rules are reused from sign-up and unknown fields are rejected with 400. A conditional claim consumes the token once, replaces the bcrypt hash and increments `session_version` in one transaction, then sends "Your password has been reset" with the UTC time and no token link. Expired, used and unknown tokens share one generic 410; a failed email restores hash, usage and version and returns 502 (ADR 0007). The client page reads the query token, clears `auth_token` on success and navigates to `/auth/sign-in`; no JWT is issued.
- The client stores the token under `localStorage` key `auth_token`, sends it as `Authorization: Bearer`, and clears it on any 401. This is an accepted XSS tradeoff with the mitigations recorded in ADR 0003: no third-party scripts, no token logging, 24-hour expiry and 401 cleanup. The client guard in `apps/app/src/auth/route-guard/` reuses `apiFetch` for `GET /api/v1/auth/me`: it renders no `/app/*` content before a 200, treats 401 as logout, and treats network failures/5xx as a retryable state that keeps the token. `/auth/*` stays public except the two credential-entry pages, which redirect a stored token to `/app/home` without a second validation call; confirmation and recovery links remain reachable while signed in. This is client-only protection — future private endpoints must validate the Bearer token themselves.

## Language and naming

- **Code, UI text, routes, endpoints, identifiers, and user-facing messages**: US English (`en-US`). This rule is documented here and in ADR 0002 as a repository convention.
- **Allowed exceptions**: internal decision comments and `.docs/` content may be in Portuguese when useful.
- Prefer descriptive names over abbreviations; avoid encoding types into names unnecessarily.

## Quality expectations

- **Tests**: add/update unit, integration, and E2E tests appropriate to the change. If a test layer is not yet present, document the gap and add the most relevant coverage.
- **Accessibility**: semantic UI, keyboard operability, labels, focus management, color not sole signal.
- **Responsiveness**: layouts must work on desktop, tablet, and mobile.
- **Observability** [target]: instrument logs/traces/metrics as services are introduced; prefer Grafana LGTM stack conventions when infra exists. The stack itself is already provisioned locally, but application instrumentation is not part of the foundation.
- **Security basics**: validate inputs, avoid leaking secrets, handle errors safely, least privilege for integrations. `.env.example` defaults are local-only and must never be reused in production.

## Change discipline

- Read relevant `.docs/*` and nearby code before editing.
- Make the smallest coherent change that solves the task.
- Update docs when behavior, commands, or architecture change.
