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

| Check                                                       | Expected                                              |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| `curl http://localhost:3000/`                               | `200 application/json` `{"message":"Hello World"}`    |
| `curl http://localhost:3000/does-not-exist`                 | JSON `404`, API still up                              |
| `curl http://localhost:5173/`                               | Page with `<h1>Hello World</h1>`, title "Hello World" |
| `curl http://localhost:3100/ready`                          | Loki ready                                            |
| `curl http://localhost:3200/ready`                          | Tempo `ready`                                         |
| `curl http://localhost:9009/ready`                          | Mimir `ready`                                         |
| `curl -u admin:admin http://localhost:3002/api/health`      | Grafana database `ok`                                 |
| `curl -u admin:admin http://localhost:3002/api/datasources` | Loki, Tempo, Mimir present                            |
| `npx supabase status`                                       | Studio 54323, Postgres 54322                          |
| `docker compose ps`                                         | Four LGTM containers running                          |
| `docker volume ls` after `infra:down`                       | LGTM and Supabase volumes still present               |

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
