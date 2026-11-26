# Architecture

> Source of truth for the repository structure and technical stack.  
> Status legend: **[current]** implemented in this repo, **[target]** planned/desired direction.

## Current state

### Monorepo

- **Package manager**: npm workspaces (`package-lock.json`, `workspaces: ["apps/*", "packages/*"]`)
- **Task orchestration**: Turborepo (`turbo.json`)
- **Language**: TypeScript across apps and packages
- **Node**: `>=22` (verified on `v22.22.1`; see root `package.json`)

### Workspaces

| Path                         | Package                   | Role                                                                                                                         | Stack                                                                                                       | Status    |
| ---------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------- |
| `apps/api`                   | `api`                     | HTTP API (port 3000): `GET /` and `/api/v1/auth/*`                                                                           | NestJS, TypeScript, Drizzle/Postgres, class-validator, bcrypt, jsonwebtoken, Nodemailer, Vitest + Supertest | [current] |
| `apps/app`                   | `app`                     | Web client (port 5173): `/`, `/auth/sign-up`, `/auth/sign-in`, `/auth/confirm-account`, `/auth/forgot-password`, `/app/home` | React 19, React Router 7, Vite 8, TypeScript, Vitest                                                        | [current] |
| `packages/ui`                | `@repo/ui`                | Shared React component library                                                                                               | React 19, TypeScript                                                                                        | [current] |
| `packages/eslint-config`     | `@repo/eslint-config`     | Shared ESLint config                                                                                                         | ESLint 10                                                                                                   | [current] |
| `packages/typescript-config` | `@repo/typescript-config` | Shared TSConfig presets                                                                                                      | TypeScript                                                                                                  | [current] |

The starter Next.js apps `apps/web` and `apps/docs` were removed by the foundation spec. Next.js-only dependencies (`next`, `@next/eslint-plugin-next`) and the `./next-js` ESLint export remain installed but are used by no workspace (D-13 in `.adrs/0001-foundation.md`).

### Current scripts

Run from repository root:

```sh
npm install
npm run dev          # turbo dev (api:3000, app:5173)
npm run build        # turbo build (Vite emits apps/app/dist/**)
npm run lint         # turbo lint
npm run check-types  # turbo check-types
npm run types:check  # alias of check-types
npm run code:fix     # turbo code:fix (mutating: eslint --fix + Prettier)
npm run test         # turbo test (Vitest: HTTP + client render seams)
npm run format       # prettier --write "**/*.{ts,tsx,md}"
npm run infra:up     # supabase start && docker compose up -d
npm run infra:down   # supabase stop && docker compose down (preserves volumes)
npm run db:migrate   # drizzle-kit migrate
```

`code:fix` is registered with `"cache": false` in `turbo.json` because it mutates source files. `types:check` and `check-types` run the same workspace checks. `apps/api` dev runs `node dev.mjs`, which compiles with `tsc --watch` and restarts the built app with `node --watch-path=dist`; this preserves `emitDecoratorMetadata` for Nest DI and DTO validation (D-16 in `.adrs/0001-foundation.md`).

### Current tooling

| Tool               | Purpose                                              | Status    |
| ------------------ | ---------------------------------------------------- | --------- |
| Turborepo          | Task orchestration/caching                           | [current] |
| TypeScript         | Static typing                                        | [current] |
| ESLint + Prettier  | Linting and formatting (`code:fix`)                  | [current] |
| Vitest + Supertest | HTTP contract, use-case unit and client render tests | [current] |
| React Router       | `/`, `/auth/*` and `/app/*` client routes            | [current] |
| Drizzle ORM        | Typed Postgres client and repositories               | [current] |
| class-validator    | Global DTO validation for auth endpoints             | [current] |
| bcrypt             | Password hashing (cost 12) and comparison            | [current] |
| jsonwebtoken       | HS256 access tokens with 24-hour expiry              | [current] |
| Nodemailer         | Mailtrap SMTP adapter                                | [current] |
| Supabase CLI       | Pinned devDependency; local Postgres                 | [current] |
| Drizzle Kit/ORM    | Migration application and schema tooling             | [current] |
| Docker Compose     | Loki, Grafana, Tempo, Mimir (LGTM)                   | [current] |
| Lefthook           | Local `pre-commit` / `commit-msg` hooks              | [current] |
| lint-staged        | Format/lint staged files on commit                   | [current] |
| Commitlint         | Conventional Commits enforcement                     | [current] |

### Local services and ports

| Service             | Port  | Notes                                                                                                                                           |
| ------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| API (`apps/api`)    | 3000  | `GET /` → `{"message":"Hello World"}`; `/api/v1/auth/sign-up`, `sign-in`, `confirm-account`, `forgot-password`, `me`                            |
| Client (`apps/app`) | 5173  | `/` → redirects to `/auth/sign-in`; `/auth/sign-up`; `/auth/sign-in`; `/auth/confirm-account`; `/auth/forgot-password`; `/app/home` (unguarded) |
| Grafana             | 3002  | Loki (default), Tempo, Mimir datasources provisioned                                                                                            |
| Loki                | 3100  | Logs                                                                                                                                            |
| Tempo               | 3200  | Traces                                                                                                                                          |
| Supabase Studio     | 54323 | Local dashboard                                                                                                                                 |
| Supabase Postgres   | 54322 | `DATABASE_URL` target for `db:migrate`                                                                                                          |
| Mimir               | 9009  | Metrics                                                                                                                                         |

Local defaults live in `.env.example`; copy it to `.env` before starting the stack. These credentials are development-only.

### Authentication slice (current)

- `apps/api/src/auth/interface/` — `AuthController`, `SignUpRequestDto` and the password-match constraint. All routes are under `/api/v1` via `configureApp()` in `apps/api/src/setup.ts`.
- `apps/api/src/auth/application/` — `SignUpUseCase` owns token generation, the transaction boundary, email dispatch and compensation when dispatch fails.
- `apps/api/src/auth/domain/` — persistence ports (`UnitOfWork`, repositories, `PasswordHasher`), the `EmailService` port, token helpers and domain errors.
- `apps/api/src/auth/infrastructure/` — Drizzle client/repositories, bcrypt hasher and the Mailtrap/Resend/console email adapters selected by `createEmailService()`.
- Tables: `users` (UUID id, unique `lower(email)`, `pending|active` status) and `account_confirmation_tokens` (hashed token, 24-hour expiry, nullable `used_at`), created by `drizzle/0001_sign_up.sql`. The table definitions live in `apps/api/src/auth/infrastructure/schema.ts` and are re-exported by `drizzle/schema.ts` for `drizzle-kit`.
- Client: `BrowserRouter` in `apps/app/src/main.tsx`; `SignUpPage` posts to `${VITE_API_URL}/api/v1/auth/sign-up` and stays on the page with a success message.
- Email provider details and the en-US/versioning conventions are recorded in ADR 0002.
- Sign-in extends the same slice: `SignInUseCase` verifies credentials and increments `session_version` atomically via `UPDATE ... RETURNING`, issues a JWT through the `AccessTokenService` port (`JwtAccessTokenService`), sends "A new session was created" and compensates a failed email with a conditional version restore. `GetCurrentSessionUseCase` and `SessionGuard` back `GET /auth/me`. `drizzle/0002_sign_in.sql` adds `session_version integer not null default 0`.
- Client: `SignInPage` posts credentials through `apiFetch`, stores `auth_token`, navigates to `/app/home`, and the shared helper adds `Authorization: Bearer` and removes the token on 401. The JWT/version and localStorage decisions are recorded in ADR 0003.
- `003-confirm-account` consumes the 001 token: `POST /api/v1/auth/confirm-account` claims an unused, unexpired hash with a conditional update, activates the account and increments `session_version` in one transaction, then signs the same 002 JWT and sends "A new session was created". Invalid, expired, used and already-active cases all return one generic 410; a failed email restores all three writes and returns 502. The public `/auth/confirm-account?token={TOKEN}` page POSTs the query token once and navigates to `/app/home` (ADR 0004). No resend endpoint exists in this initiative.
- `004-forgot-password` adds `drizzle/0003_forgot_password.sql`: the `password_reset_tokens` table holds an opaque token's SHA-256 hash, one-hour `expires_at`, nullable `used_at` and `created_at`, with a unique hash index and a partial unique index on `user_id WHERE used_at IS NULL`. `ForgotPasswordUseCase` locks the account row with `AccountRepository.findByEmailForUpdate` (`SELECT ... FOR UPDATE`) inside `UnitOfWork.run`, derives a silent 60-second cooldown from the newest unconsumed row, invalidates older rows and inserts the new token. Email dispatch follows the commit; a failed send deletes the new row, logs the error and still yields the same 202. `POST /api/v1/auth/forgot-password` returns one fixed message for active, unknown, `pending`, throttled and failed-dispatch cases (ADR 0005). The public `/auth/forgot-password` page stays on the generic success message and links back to sign-in. Token consumption, the reset page and password change are deferred to `005-reset-password`.

## Target architecture

These items remain product/engineering direction, not current implementation. Do not assume they exist unless verified in code/config.

| Area             | Target                                                                  | Notes                                                                          |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Backend layering | `interface` / `application` / `domain` / `infrastructure` in `apps/api` | Implemented for the auth slice; other capabilities can follow the same pattern |
| Testing          | Playwright E2E in addition to Vitest/Supertest                          | Smoke coverage exists; browser E2E is deferred                                 |
| Observability    | Application log/trace/metric instrumentation                            | LGTM containers and datasources exist; no app instrumentation yet              |
| Deployment       | Vercel                                                                  | App/API deployment target                                                      |
| Design system    | Tokens/shadcn-ui                                                        | Deliberately not introduced in the foundation                                  |

ESLint + Prettier are the chosen lint/format stack (ADR 0001); OXLint/OXFmt were explicitly rejected and are not targets.

## Repository conventions

- Prefer inspecting actual files/config before relying on documentation.
- When implementing target architecture, update this file in the same change.
- Keep workspace/package names aligned with `package.json` and `turbo.json`.
