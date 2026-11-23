# Implementation plan — Foundation — API and Web Client Monorepo Bootstrap

- **Spec:** specs/000-foundation.md
- **Status:** approved
- **Created:** 2026-11-23

> The invocation named `001-foundation`; the only spec present is `000-foundation.md`. The user confirmed this is the intended spec on 2026-11-23.

## Objective

Replace the Turborepo starter apps with a NestJS hello-world API and a React/Vite hello-world client, and deliver the documented local command surface (quality, infra, migrations, hooks) so a developer can go from a clean checkout to both hello-world contracts and all local services using only repository commands.

## Context loaded

- **AGENTS.md files read:** `AGENTS.md` (root, Turborepo managed rules), `.docs/AGENTS.md` (context pack index and working rules). No nested `AGENTS.md` exist under `apps/` or `packages/` (verified with `find`).
- **Context pack read:** `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/RULES.md`, `.docs/QA.md`, `.docs/BUSINESS.md`, `.docs/DESIGN.md`, `.docs/DESIGN_SYSTEM.md`.
- **Skills loaded:** `implement-me`, `feature-concept` (readiness pass), `tdd` (smoke-test seams), `frontend-design` (Vite page). `shadcn`, `next-best-practices`, `vercel-react-best-practices`, and `playwright` are intentionally not loaded — the spec excludes shadcn/design tokens, Next.js work, and E2E.
- **Verified in code/config:**
  - Root `package.json`: scripts `build`/`dev`/`lint`/`format`/`check-types`; `engines.node: ">=24"`; `devEngines` npm `9.2.0`; devDeps `prettier 3.9.6`, `turbo ^2.11.13`, `typescript 7.0.2`; workspaces `["apps/*", "packages/*"]`.
  - `turbo.json`: `build` outputs only `.next/**` variants; tasks `build`, `lint`, `check-types`, `dev`; `dev` already `cache: false`.
  - `apps/web/package.json` and `apps/docs/package.json`: Next.js 16.3.8 on ports 3000/3001; both use `@repo/eslint-config/next-js` and `@repo/typescript-config/nextjs.json`.
  - `packages/eslint-config/package.json`: `./next-js` export and `@next/eslint-plugin-next 16.3.4` present (D-13 must preserve both).
  - `packages/eslint-config/base.js` and `react-internal.js`: ESLint 10 flat configs using Babel parser; usable by the new apps.
  - Installed Turbo docs: `node_modules/turbo/docs/README.md` and `crafting-your-repository/configuring-tasks.mdx` read; `"cache": false` is the documented way to register side-effecting tasks, and Vite build outputs are `dist/**`.
  - Toolchain: Node `v22.22.1`, npm `9.2.0`, Docker `29.8.0`, Compose `v5.5.1`, no global `supabase` CLI; `npm ping` reached `https://registry.npmjs.org/` (412 ms).
  - Baseline `npm run lint` and `npm run check-types` both pass on the current starter (3/3 tasks each).
  - Scratch compile with installed TypeScript `7.0.2`: legacy decorators + `emitDecoratorMetadata` compile under `module/moduleResolution: NodeNext`; `moduleResolution: node` is removed in TS 7 — new app tsconfigs must use NodeNext (or bundler for the Vite app).
  - Missing targets (must be installed): `@nestjs/*`, `vite`, `@vitejs/plugin-react`, `vitest`, `supertest`, `supabase`, `drizzle-orm`, `drizzle-kit`, `lefthook`, `lint-staged`, `@commitlint/*`.
  - `git status`: `.adrs/`, `.agents/`, `.docs/`, `.plans/`, `specs/`, `skills/` and `skills-lock.json` are untracked user work — edit in place, do not delete, stage, or commit.
- **Target items not yet implemented:** `apps/api`, `apps/app`, `docker-compose.yml`, `drizzle.config.ts`, `.env.example`, `lefthook.yml`, lint-staged/Commitlint config, `supabase/config.toml`, initial Drizzle migration, root scripts `code:fix`/`types:check`/`test`/`infra:up`/`infra:down`/`db:migrate`, ADR, and all doc/README updates.

## Decisions carried from the spec

- **D-1 — Replace `apps/web`/`apps/docs` with `apps/api`/`apps/app`** — matches target layout; ADR: yes (single foundation ADR).
- **D-2 — Keep ESLint 10 + Prettier 3.9.6; reject OXLint/OXFmt** — `code:fix` is `eslint . --fix` + Prettier write; ADR: yes (same ADR).
- **D-3 — Vitest + Supertest smoke tests only** — HTTP and client-render seams, no Playwright; ADR: no.
- **D-4 — `engines.node: ">=22"`** — matches verified v22.22.1; ADR: no.
- **D-5 — Lefthook + lint-staged + Commitlint, no CI** — local gates only; ADR: no.
- **D-6 — Add `code:fix`/`types:check` aliases, keep `lint`/`check-types`** — `types:check` delegates to `turbo run check-types`; ADR: no.
- **D-7 — Pinned Supabase CLI via `node_modules/.bin`; `infra:down` without `-v`** — preserves volumes; ADR: no.
- **D-8 — Ports: API 3000, client 5173, Loki 3100, Grafana 3002, Tempo 3200, Mimir 9009, Studio 54323, Postgres 54322** — ADR: no.
- **D-9 — Drizzle Kit applies migrations to Supabase Postgres** — initial migration empty; ADR: no.
- **D-10 — `GET /` → `{"message":"Hello World"}`; client `<h1>Hello World</h1>`, title "Hello World"** — ADR: no.
- **D-11 — Minimal scaffolding** — no domain layers, router, or design system; ADR: no.
- **D-12 — Keep all three `@repo/*` packages unchanged** — ADR: no.
- **D-13 — Keep Next.js-only deps and `./next-js` export dormant** — verified present; ADR: no.
- **D-14 — One ADR + coherent docs/README in the same change** — ADR: the foundation ADR itself.
- **D-15 — `.env.example` with local defaults, no env-validation library** — ADR: no.
- **Repository facts used:** installed Turbo 2.11.13 docs define side-effect tasks and `dist/**` outputs — verified in `node_modules/turbo/docs/crafting-your-repository/configuring-tasks.mdx`; TS 7 dropped `moduleResolution: node` but accepts legacy decorators under NodeNext — verified by scratch compile.

## Approach

Work in vertical slices ordered so each observable contract is testable before moving on: API contract first, client contract second, then the root quality/hook surface, then local infrastructure and migrations, and finally docs/ADR coherence. Each test is written at a pre-agreed seam before the minimal implementation (TDD red → green). Package installation happens in the first slice that needs each dependency, with the root manifest and lockfile updated in the same slice. Documentation and ADR land in the same change as the behavior they describe.

## Work breakdown (vertical slices)

### Slice 1 — NestJS API returns the hello-world JSON and a JSON 404

- **Files:** create `apps/api/` (`package.json`, `tsconfig.json`, `eslint.config.mjs`, `nest-cli.json` only if needed for build, `src/main.ts`, `src/app.module.ts`, `src/app.controller.ts`, `test/app.e2e-spec.ts`); delete `apps/web/**` and `apps/docs/**`; update root `package.json` (`engines.node`, devDeps for Vitest/Supertest, `test` script), `package-lock.json`, and `turbo.json` (`test` task).
- **Seam / test:** HTTP seam — Supertest against `AppModule` (no real socket): asserts status 200, `application/json`, `{"message":"Hello World"}`, plus JSON 404 with server still up. Catches wrong contract or missing Nest wiring; misses real port binding (covered by manual curl).
- **Verification:** `npm install`; `npm run test -w api` (red before controller exists, green after); `npm run lint -w api`; `npm run check-types -w api`; manual `npm run dev -w api` + `curl -i localhost:3000/` and `curl -i localhost:3000/does-not-exist`.

### Slice 2 — Vite client renders the hello-world page and builds to `dist/**`

- **Files:** create `apps/app/` (`package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `eslint.config.mjs`, `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`, `src/vite-env.d.ts`); update `turbo.json` build outputs to add `dist/**` alongside existing `.next/**` entries.
- **Seam / test:** client render seam — Vitest (jsdom + React Testing Library) asserts one `<h1>Hello World</h1>` and `document.title === "Hello World"`. Catches wrong heading/title; misses real browser layout (manual QA covers it).
- **Verification:** `npm run test -w app` (red before page exists, green after); `npm run build` emits `apps/app/dist/**`; `npm run dev` starts client on 5173.

### Slice 3 — Root command surface, quality gates, and local hooks are reproducible

- **Files:** root `package.json` (add `code:fix: turbo run code:fix`, `types:check: turbo run check-types`, keep `lint`/`check-types`/`build`/`dev`/`format`; add pinned devDeps `lefthook`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional`); each app `package.json` (`code:fix`, `test` scripts); `turbo.json` (`code:fix` with `"cache": false`); `lefthook.yml`; `commitlint.config.js`; lint-staged config in root `package.json`.
- **Seam / test:** script seam (root command names and exit codes) and hook seam (Commitlint accepts `feat: add foundation`, rejects `banana`). Catches missing/misnamed scripts and misconfigured hooks; misses cross-OS shell differences.
- **Verification:** `npm run lint`, `npm run check-types`, `npm run types:check`, `npm run test`, `npm run build`; deliberately misformat a source file, run `npm run code:fix`, confirm rewrite and clean `npm run lint`; `npx lefthook install` then `echo "feat: add foundation" | npx commitlint` (pass) and `echo "banana" | npx commitlint` (fail).

### Slice 4 — Local infra starts, Drizzle migration is idempotent, and env defaults work

- **Files:** `docker-compose.yml` (Loki 3100, Grafana 3002, Tempo 3200, Mimir 9009, named volumes), `grafana/provisioning/datasources/*.yml` (Loki/Tempo/Mimir, dev credentials), `supabase/config.toml`, `drizzle.config.ts`, `drizzle/0000_*.sql` + `drizzle/meta/_journal.json` + snapshot (empty initial migration), `.env.example`, root scripts `infra:up`, `infra:down`, `db:migrate` (and pinned root devDeps `supabase`, `drizzle-orm`, `drizzle-kit`).
- **Seam / test:** infra seam (`supabase status`, `docker compose ps`, Grafana health/datasources API probes) and migration seam (`npm run db:migrate` twice). Catches services not starting, datasources not provisioned, or non-idempotent migrations; misses schema correctness because the migration is empty.
- **Verification:** `npm run infra:up`; probe `localhost:3002/api/health`, Loki `3100/ready`, Tempo `3200/ready`, Mimir `9009/ready`, and Grafana datasource API; `npm run db:migrate` twice (second reports no pending); `npm run infra:down`; confirm volumes remain in `docker volume ls`; confirm `.env.example` copy provides the documented Postgres URL and Grafana credentials.

### Slice 5 — Docs, README, and the foundation ADR are coherent

- **Files:** `.adrs/0001-foundation.md` (records D-1, D-2, plus D-4/D-7/D-13 context), `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/QA.md`, `README.md`.
- **Seam / test:** reviewer doc read (no stale `apps/web`/`apps/docs`-as-current, no OXLint/OXFmt as chosen stack; QA.md lists the now-real commands). Catches documentation drift; automated by grep plus manual read.
- **Verification:** grep the four docs for stale app names and OXLint/OXFmt; read the ADR and confirm D-1/D-2; run every command listed in updated QA.md.

### Slice 6 — Full clean-checkout verification and delivery report

- **Files:** none (verification only).
- **Seam / test:** all seams above, run in the documented order from the repository root.
- **Verification:** all QA commands below, plus AC-16 (`ls apps`, `@next/eslint-plugin-next` and `./next-js` still present) and AC-18 (no expert/connector/task/artifact modules).

## Dependencies & additions

- **Root devDependencies (pinned):** `supabase`, `drizzle-orm`, `drizzle-kit`, `vitest`, `supertest`, `lefthook`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional` — required by the spec's command surface. Versions chosen at install time for Node 22 / TS 7 compatibility and recorded in the lockfile.
- **`apps/api`:** `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs`; dev: `@types/node`, `@types/supertest`, `typescript`, `eslint`, `@repo/eslint-config`, `@repo/typescript-config`. Minimal Nest skeleton only.
- **`apps/app`:** `react`, `react-dom`; dev: `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@types/node`, `typescript`, `eslint`, `@repo/eslint-config`, `@repo/typescript-config`, `jsdom`, `@testing-library/react` (the last two are the smallest honest way to test the document-title/heading seam with Vitest).
- **Removed:** no npm packages removed (D-13 keeps Next.js-only deps installed); removed directories are the starter apps only.
- **Config/infra:** `docker-compose.yml`, `grafana/provisioning/`, `supabase/config.toml`, `drizzle.config.ts`, `drizzle/`, `.env.example`, `lefthook.yml`, `commitlint.config.js`. No migrations beyond the empty initial one; no CI workflow.

## Risks, assumptions & follow-ups

- **AC-17 interpretation (needs confirmation at approval):** AC-17 says "the API connects to the documented local Supabase Postgres", but the spec also forbids domain code and defines an empty initial migration. This plan interprets AC-17 as "`.env` provides `DATABASE_URL` used by Drizzle/`db:migrate`, and Grafana uses the documented dev credentials" — the hello-world API itself has no DB client. If a runtime DB connection is required, scope changes and the spec must be refined before coding.
- **TypeScript 7.0.2 + NestJS:** scratch compile confirms decorators work under NodeNext, but Nest's published types may still assume older module resolution — mitigation: use `module/moduleResolution: NodeNext` in the API tsconfig and validate `check-types`/`build` in Slice 1 before proceeding; if Nest build tooling proves incompatible, document the gap and use the smallest compatible build configuration rather than silently upgrading/downgrading TypeScript.
- **Dependency install needs network:** npm registry was reachable during planning, but a truly offline clean checkout cannot install the new pinned deps; this is an environment prerequisite, not a code defect.
- **Docker/Supabase image pulls:** `infra:up` may need to download large images; a stopped daemon or missing pinned CLI after install must surface the underlying tool error (no silent skip).
- **Untracked user work:** `.docs/`, `specs/`, `.plans/`, `.adrs/`, `.agents/`, `skills/` are untracked. Edits are in place only; nothing staged or committed.
- **Deliberate follow-ups (out of scope):** Playwright E2E, CI workflow, Nest domain layers, design tokens/shadcn, and a future decision on removing dormant Next.js dependencies.

## ADR candidates

- **Foundation layout and lint/format stack** — one ADR at `.adrs/0001-foundation.md` records D-1 (replace starter apps) and D-2 (ESLint + Prettier, OXLint/OXFmt rejected), as required by the spec and `.docs/RULES.md`.

## Quality checks (from QA.md)

Run from the repository root after the relevant slices and again at the end:

- [ ] `npm install` (AC-4: clean install, no engine error)
- [ ] `npm run lint`
- [ ] `npm run check-types`
- [ ] `npm run types:check`
- [ ] `npm run build` (assert `apps/app/dist/**`)
- [ ] `npm run test` (Vitest + Supertest smoke tests)
- [ ] `npm run code:fix` (mutating; verify a misformatted file is rewritten, then re-run `npm run lint`)
- [ ] Formatting verified with `npx prettier --check "**/*.{ts,tsx,md}"` (non-mutating equivalent of the `format` script; `npm run format` is a write command)
- [ ] `npm run infra:up` / `docker compose ps` / Grafana + service health probes
- [ ] `npm run db:migrate` twice (idempotent)
- [ ] `npm run infra:down` and `docker volume ls`
- [ ] Commitlint valid/invalid message via CLI and Lefthook hook check

Update `.docs/QA.md` in Slice 5 so `code:fix`, `types:check`, `test`, `infra:up`/`infra:down`, and `db:migrate` are listed as implemented, while `test:e2e` remains a target.

## Manual QA

1. From a clean checkout on Node v22.22.1: `npm install` → completes with `api`, `app`, and three `@repo/*` workspaces; `ls apps` shows only `api` and `app`; `node -p "require('./packages/eslint-config/package.json').exports['./next-js']"` still resolves.
2. `npm run dev` → `curl -i http://localhost:3000/` returns 200 `application/json` `{"message":"Hello World"}`; `curl -i http://localhost:3000/does-not-exist` returns JSON 404 and a second request to `/` still returns 200.
3. Open `http://localhost:5173/` → one `<h1>Hello World</h1>`, browser tab title "Hello World", readable at desktop/tablet/mobile widths with no horizontal scroll.
4. `npm run lint`, `npm run check-types`, `npm run types:check`, `npm run build`, `npm run test` → all exit 0; `apps/app/dist/**` exists.
5. Misformat a source file (add stray semicolons/indent), run `npm run code:fix`, confirm the file is rewritten and `npm run lint` exits 0.
6. `cp .env.example .env`, then `npm run infra:up` → Supabase Studio on 54323, Postgres on 54322, Loki 3100, Grafana 3002, Tempo 3200, Mimir 9009; `docker compose ps` shows four LGTM containers healthy/running.
7. Open `http://localhost:3002` with the documented dev credentials → Loki, Tempo, and Mimir datasources are present and provisioned.
8. `npm run db:migrate` twice → first applies the initial migration, second reports no pending migrations; `npm run infra:down` → services stop, and their volumes still appear in `docker volume ls`.
9. With `npx lefthook install` active: commit a staged file with `feat: add foundation` (pre-commit lint-staged runs, commit-msg accepts); attempt `banana` (commit rejected).
10. Read `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/QA.md`, `README.md`, and `.adrs/0001-foundation.md` → no removed app is presented as current, no OXLint/OXFmt as chosen stack, D-1 and D-2 recorded.

## Rollback

Revert the generated commit(s) with `git revert` (or `git restore` before committing) and re-run `npm install` to restore the starter workspace graph; the removed apps are recoverable from git history. `npm run infra:down` stops containers without `-v`, so volumes are preserved; removing volumes would require an explicit destructive `docker compose down -v` or `supabase stop --no-backup`, which this plan never does. Nothing in this foundation is irreversible.

## Approval

- [ ] Approved by <user> on <date> — scope as written above, including the AC-17 interpretation note.
