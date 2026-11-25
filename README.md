# Foundation monorepo

A Turborepo/npm-workspaces foundation for the expert platform. It contains a NestJS API (`GET /` plus `/api/v1/auth/*` for sign-up, sign-in, account confirmation and session validation), a React + Vite client with public `/auth/sign-up`, `/auth/sign-in` and `/auth/confirm-account` pages, local Supabase Postgres, a Grafana LGTM stack, and reproducible quality commands.

Architectural decisions are recorded in [`.adrs/0001-foundation.md`](.adrs/0001-foundation.md), [`.adrs/0002-sign-up-conventions.md`](.adrs/0002-sign-up-conventions.md), [`.adrs/0003-sessions.md`](.adrs/0003-sessions.md) and [`.adrs/0004-confirm-account.md`](.adrs/0004-confirm-account.md). Product direction lives in `.docs/BUSINESS.md`; engineering context lives in `.docs/`.

## Workspaces

| Path                         | Package                   | Role                                                                                            | Port |
| ---------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- | ---- |
| `apps/api`                   | `api`                     | NestJS API, `GET /` and `/api/v1/auth/*`                                                        | 3000 |
| `apps/app`                   | `app`                     | React + Vite pages: `/`, `/auth/sign-up`, `/auth/sign-in`, `/auth/confirm-account`, `/app/home` | 5173 |
| `packages/ui`                | `@repo/ui`                | Shared React components                                                                         | —    |
| `packages/eslint-config`     | `@repo/eslint-config`     | Shared ESLint flat configs                                                                      | —    |
| `packages/typescript-config` | `@repo/typescript-config` | Shared TSConfig presets                                                                         | —    |

The starter `apps/web` and `apps/docs` apps were removed by the foundation spec. Next.js-only dependencies and the `./next-js` ESLint export remain installed but unused (D-13).

## Quickstart

Requires Node `>=22` (verified on `v22.22.1`), npm `9.2.0`, and Docker with Compose v5 for local infrastructure.

```sh
npm install                 # also installs Lefthook hooks via prepare
cp .env.example .env        # local-only defaults; never reuse in production

npm run dev                 # API on :3000, client on :5173
curl http://localhost:3000/ # {"message":"Hello World"}
# open http://localhost:5173/ → <h1>Hello World</h1>, title "Hello World"
# open http://localhost:5173/auth/sign-up → public sign-up form
# open http://localhost:5173/auth/sign-in → public sign-in form
# open the emailed /auth/confirm-account?token={TOKEN} link → confirms the account
```

## Authentication

- `POST /api/v1/auth/sign-up` accepts `firstName`, `lastName`, `email`, `password` and matching `confirmPassword` (minimum 8 characters). It returns 201 with a short acknowledgement, or 400/409/502 with an en-US message.
- A successful sign-up persists a `pending` account with a bcrypt hash and an opaque confirmation token whose SHA-256 hash expires in 24 hours. The confirmation email is sent through `EmailService`: Mailtrap SMTP by default in development/test, Resend in production, and a console fallback when credentials are missing (the fallback prints the link for local QA).
- `APP_URL` builds the `{APP_URL}/auth/confirm-account?token={TOKEN}` link; `VITE_API_URL` points the client at the API. `EMAIL_PROVIDER` overrides the environment-based provider choice. All variables are documented in `.env.example` and are local-only defaults.
- `POST /api/v1/auth/confirm-account` accepts `{ token }` in the JSON body. The page reads the query token and POSTs it once, so a plain GET or scanner prefetch consumes nothing. Success returns `{ accessToken, tokenType: "Bearer", expiresIn: 86400 }`, activates the account, increments `session_version` and sends "A new session was created". Unknown, expired, used or already-active tokens all return the same generic 410: "This confirmation link is invalid or has expired." A failed email restores status, token usage and version and returns 502. There is no self-service resend endpoint in this initiative (ADR 0004).
- `POST /api/v1/auth/sign-in` accepts `{ email, password }`. It compares with bcrypt, returns 401 with one generic message for an unknown email or wrong password, 403 with confirmation guidance for a `pending` account, and 502 if the notification fails. Success returns `{ accessToken, tokenType: "Bearer", expiresIn: 86400 }` and sends "A new session was created" through `EmailService`.
- A session is an HS256 JWT signed with `JWT_SECRET`, carrying `sub` and a `ver` claim matched against `users.session_version`. The version is incremented atomically on every session creation (sign-in and account confirmation), so the last login wins. `GET /api/v1/auth/me` with `Authorization: Bearer {token}` returns non-sensitive account data or 401 for stale, expired, tampered or missing tokens. Email failure restores the previous version and withholds the token.
- The client stores the token in `localStorage` under `auth_token`, adds the Bearer header through `apiFetch`, and removes it on any 401. The tradeoff and mitigations are documented in ADR 0003.
- `/auth/*` is public; `/app/home` is an unguarded placeholder until route protection arrives in a later spec. A lost or expired confirmation link is a dead end by design — sign up again to receive a duplicate-email 409 rather than a resend.

## Quality commands

```sh
npm run lint                # ESLint via Turborepo
npm run check-types         # TypeScript via Turborepo
npm run types:check         # alias of check-types
npm run test                # Vitest + Supertest smoke tests
npm run build               # builds all workspaces; emits apps/app/dist/**
npm run code:fix            # eslint --fix + Prettier write (mutating, uncached)
npm run format              # Prettier write for ts/tsx/md
npx prettier --check "**/*.{ts,tsx,md}"  # non-mutating format check
```

See [`.docs/QA.md`](.docs/QA.md) for the full list, recommended order and probes.

## Local infrastructure

```sh
npm run infra:up            # supabase start && docker compose up -d
npm run db:migrate          # Drizzle migration (idempotent)
npm run infra:down          # supabase stop && docker compose down; volumes preserved
```

| Service           | Port  | Notes                                                       |
| ----------------- | ----- | ----------------------------------------------------------- |
| Supabase Studio   | 54323 | Local dashboard                                             |
| Supabase Postgres | 54322 | `DATABASE_URL` in `.env.example`                            |
| Grafana           | 3002  | `admin`/`admin`; Loki, Tempo, Mimir datasources provisioned |
| Loki              | 3100  | Logs                                                        |
| Tempo             | 3200  | Traces                                                      |
| Mimir             | 9009  | Metrics                                                     |

Configuration lives in `supabase/config.toml`, `docker-compose.yml`, `monitoring/`, `grafana/provisioning/`, `drizzle.config.ts` and `drizzle/`. `.env.example` carries development-only defaults; do not use them in production.

## Commits

Lefthook runs `lint-staged` on `pre-commit` and `commitlint` on `commit-msg`. Use Conventional Commits, for example `feat: add foundation`.

From OpenCode, run `/commit-and-push` at the end of every spec execution. It analyzes all pending changes (including untracked files), derives a Conventional Commit message unless you pass one, stages everything with `git add -A`, commits with `Co-authored-by: OpenCode Agent <opencode@opencode.ai>`, and pushes the current branch. You can override the message: `/commit-and-push 'feat(api): add hello-world endpoint'`. Hooks and Commitlint are not bypassed.

## Turborepo utilities

Tasks are configured in `turbo.json`. Run a task for one workspace with npm filters, for example `npm run build -w app` or `npm run test -w api`. Remote caching is not configured; caching is local by default. Useful references: [Tasks](https://turborepo.dev/docs/crafting-your-repository/running-tasks), [Caching](https://turborepo.dev/docs/crafting-your-repository/caching), [Configuration](https://turborepo.dev/docs/reference/configuration).
