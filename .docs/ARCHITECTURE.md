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

| Path                         | Package                   | Role                               | Stack                                  | Status    |
| ---------------------------- | ------------------------- | ---------------------------------- | -------------------------------------- | --------- |
| `apps/api`                   | `api`                     | Hello-world HTTP API (port 3000)   | NestJS, TypeScript, Vitest + Supertest | [current] |
| `apps/app`                   | `app`                     | Hello-world web client (port 5173) | React 19, Vite 8, TypeScript, Vitest   | [current] |
| `packages/ui`                | `@repo/ui`                | Shared React component library     | React 19, TypeScript                   | [current] |
| `packages/eslint-config`     | `@repo/eslint-config`     | Shared ESLint config               | ESLint 10                              | [current] |
| `packages/typescript-config` | `@repo/typescript-config` | Shared TSConfig presets            | TypeScript                             | [current] |

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

`code:fix` is registered with `"cache": false` in `turbo.json` because it mutates source files. `types:check` and `check-types` run the same workspace checks.

### Current tooling

| Tool               | Purpose                                    | Status    |
| ------------------ | ------------------------------------------ | --------- |
| Turborepo          | Task orchestration/caching                 | [current] |
| TypeScript         | Static typing                              | [current] |
| ESLint + Prettier  | Linting and formatting (`code:fix`)        | [current] |
| Vitest + Supertest | Smoke tests (HTTP contract, client render) | [current] |
| Supabase CLI       | Pinned devDependency; local Postgres       | [current] |
| Drizzle Kit/ORM    | Migration application and schema tooling   | [current] |
| Docker Compose     | Loki, Grafana, Tempo, Mimir (LGTM)         | [current] |
| Lefthook           | Local `pre-commit` / `commit-msg` hooks    | [current] |
| lint-staged        | Format/lint staged files on commit         | [current] |
| Commitlint         | Conventional Commits enforcement           | [current] |

### Local services and ports

| Service             | Port  | Notes                                                |
| ------------------- | ----- | ---------------------------------------------------- |
| API (`apps/api`)    | 3000  | `GET /` → `{"message":"Hello World"}`                |
| Client (`apps/app`) | 5173  | `<h1>Hello World</h1>`, title "Hello World"          |
| Grafana             | 3002  | Loki (default), Tempo, Mimir datasources provisioned |
| Loki                | 3100  | Logs                                                 |
| Tempo               | 3200  | Traces                                               |
| Supabase Studio     | 54323 | Local dashboard                                      |
| Supabase Postgres   | 54322 | `DATABASE_URL` target for `db:migrate`               |
| Mimir               | 9009  | Metrics                                              |

Local defaults live in `.env.example`; copy it to `.env` before starting the stack. These credentials are development-only.

## Target architecture

These items remain product/engineering direction, not current implementation. Do not assume they exist unless verified in code/config.

| Area             | Target                                                                  | Notes                                                                |
| ---------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Backend layering | `interface` / `application` / `domain` / `infrastructure` in `apps/api` | Added with the first real feature; the skeleton has no domain layers |
| Testing          | Playwright E2E in addition to Vitest/Supertest                          | Smoke coverage exists; browser E2E is deferred                       |
| Observability    | Application log/trace/metric instrumentation                            | LGTM containers and datasources exist; no app instrumentation yet    |
| Deployment       | Vercel                                                                  | App/API deployment target                                            |
| Design system    | Tokens/shadcn-ui                                                        | Deliberately not introduced in the foundation                        |

ESLint + Prettier are the chosen lint/format stack (ADR 0001); OXLint/OXFmt were explicitly rejected and are not targets.

## Repository conventions

- Prefer inspecting actual files/config before relying on documentation.
- When implementing target architecture, update this file in the same change.
- Keep workspace/package names aligned with `package.json` and `turbo.json`.
