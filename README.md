# Foundation monorepo

A Turborepo/npm-workspaces foundation for the expert platform. It contains a NestJS API (`GET /` plus `/api/v1/auth/*`), a React + Vite client with a public `/auth/sign-up` page, local Supabase Postgres, a Grafana LGTM stack, and reproducible quality commands.

Architectural decisions are recorded in [`.adrs/0001-foundation.md`](.adrs/0001-foundation.md) and [`.adrs/0002-sign-up-conventions.md`](.adrs/0002-sign-up-conventions.md). Product direction lives in `.docs/BUSINESS.md`; engineering context lives in `.docs/`.

## Workspaces

| Path                         | Package                   | Role                                                  | Port |
| ---------------------------- | ------------------------- | ----------------------------------------------------- | ---- |
| `apps/api`                   | `api`                     | NestJS API, `GET /` and `/api/v1/auth/*`              | 3000 |
| `apps/app`                   | `app`                     | React + Vite pages: `/`, `/auth/sign-up`, `/app/home` | 5173 |
| `packages/ui`                | `@repo/ui`                | Shared React components                               | —    |
| `packages/eslint-config`     | `@repo/eslint-config`     | Shared ESLint flat configs                            | —    |
| `packages/typescript-config` | `@repo/typescript-config` | Shared TSConfig presets                               | —    |

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
```

## Authentication

- `POST /api/v1/auth/sign-up` accepts `firstName`, `lastName`, `email`, `password` and matching `confirmPassword` (minimum 8 characters). It returns 201 with a short acknowledgement, or 400/409/502 with an en-US message.
- A successful sign-up persists a `pending` account with a bcrypt hash and an opaque confirmation token whose SHA-256 hash expires in 24 hours. The confirmation email is sent through `EmailService`: Mailtrap SMTP by default in development/test, Resend in production, and a console fallback when credentials are missing (the fallback prints the link for local QA).
- `APP_URL` builds the `{APP_URL}/auth/confirm-account?token={TOKEN}` link; `VITE_API_URL` points the client at the API. `EMAIL_PROVIDER` overrides the environment-based provider choice. All variables are documented in `.env.example` and are local-only defaults.
- `/auth/*` is public; `/app/home` is an unguarded placeholder until route protection arrives in a later spec. Token confirmation is implemented in `003-confirm-account`.

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
