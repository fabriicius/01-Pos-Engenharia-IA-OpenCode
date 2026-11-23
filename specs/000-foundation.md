# Foundation — API and Web Client Monorepo Bootstrap

- **Spec:** 000-foundation
- **Status:** ready-for-implementation
- **Created:** 2026-11-21
- **Last updated:** 2026-11-21
- **Source:** feature-concept session (refine-spec of the prompt-provided `specs/000-foundation.md`)

## Problem & motivation

The repository is currently a Turborepo starter: two Next.js apps (`apps/web`, `apps/docs`), shared `@repo/*` packages, ESLint/Prettier/TypeScript, and no API, database, observability stack, test runner or quality-command surface beyond `lint`/`check-types`/`build`/`dev`. The workspaces and infrastructure described as [target] in `.docs/ARCHITECTURE.md` do not exist, so engineering cannot start the expert platform in `.docs/BUSINESS.md` without ad-hoc setup. The observable signal that this is fixed: from a clean checkout, a developer installs dependencies, runs every quality script, brings up local infrastructure, applies migrations, and reaches both hello-world endpoints using only documented commands.

## Goals / non-goals

- **Goals:**
  - Replace the starter apps with `apps/api` (NestJS, `GET /` JSON hello world) and `apps/app` (React + Vite + TypeScript, hello-world page).
  - Establish the root command surface: keep `lint`, `check-types`, `build`, `dev`; add `code:fix`, `types:check`, `test`, `infra:up`, `infra:down`, `db:migrate`.
  - Provide local infrastructure: Supabase local Postgres through a pinned CLI devDependency, plus a `docker-compose.yml` Loki/Grafana/Tempo/Mimir stack with provisioned datasources.
  - Configure smoke-level automated tests (Vitest + Supertest) and local quality hooks (Lefthook, lint-staged, Commitlint).
  - Keep the three existing `@repo/*` packages; document and track every settled decision in one ADR and coherent `.docs/*` + `README.md`.
- **Non-goals:**
  - Implement any expert, connector, task or artifact feature from `.docs/BUSINESS.md`.
  - Introduce Playwright E2E, a CI workflow, Nest domain layers, routing, shadcn/ui or design tokens.
  - Migrate linting/formatting to OXLint/OXFmt (explicitly rejected, see D-2).
  - Remove the dormant Next.js-only dependencies and ESLint export (explicitly rejected, see D-13).
- **Explicitly out of scope:**
  - Production deployment/Vercel, remote caching, authentication, real data, feature flags, observability instrumentation of application code.

## Users & jobs to be done

- **Developer:** clone the repo, install once, run the documented quality/infra commands, and start feature work without improvising configuration.
- **Reviewer / QA engineer:** verify the hello-world contracts and the infra commands from a clean environment using only the commands in this spec.
- **Not served:** end users of the eventual product (no feature UI exists yet) and production operators (no deploy path is defined here).

## Domain model & vocabulary

This is infrastructure work; no product concepts from `.docs/BUSINESS.md` (source/connector, normalized knowledge, expert, task/request, artifact/output) are introduced. New terms are engineering-only:

- **[current]** Workspace — an npm workspaces entry under `apps/*` or `packages/*`, orchestrated by Turborepo `2.11.13` (verified in root `package.json` and `node_modules/turbo/package.json`).
- **[target]** API — the NestJS application in `apps/api`, package name `api`.
- **[target]** Client — the React + Vite application in `apps/app`, package name `app`.
- **[target]** Local infrastructure — Supabase local Postgres plus the four-service LGTM stack defined in `docker-compose.yml`.
- **[target]** Quality gate — a root script reproducible from a clean checkout.

Invariant: code identifiers, routes, endpoints and UI text are US English (`en-US`) per `.docs/DEVELOPMENT.md:38`.

## Scope in code

- **[target]** `apps/api` — NestJS standard skeleton (`main.ts`, `AppModule`, `AppController`), listening on port 3000, exposing `GET /`.
- **[target]** `apps/app` — Vite + React + TypeScript app listening on port 5173, single route `/` rendering a heading.
- **[current → removed]** `apps/web` and `apps/docs` directories. Workspaces are auto-discovered by `workspaces: ["apps/*", "packages/*"]`, so no root manifest edit is needed to drop them.
- **[current, unchanged]** `packages/ui`, `packages/eslint-config`, `packages/typescript-config`.
- **[current, unchanged, dormant]** Next.js-only dependencies and the `./next-js` export of `@repo/eslint-config` remain installed and configured but are used by no workspace (D-13).
- **[target]** Root `package.json` — `engines.node` becomes `>=22`; scripts `code:fix`, `types:check`, `test`, `infra:up`, `infra:down`, `db:migrate`; pinned devDependencies: `supabase`, `drizzle-orm`, `drizzle-kit`, `vitest`, `supertest`, `lefthook`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional`.
- **[target]** Each app — `code:fix` script (`eslint . --fix` plus Prettier write) and `test` script (`vitest run`). `types:check` stays a root alias of `turbo run check-types`; the existing `lint`/`check-types` scripts are not renamed.
- **[target]** `turbo.json` — register `code:fix` with `"cache": false` (mutating task, per installed `turbo/docs/crafting-your-repository/configuring-tasks.mdx` "Performing side-effects"), register `test`, and add `dist/**` to build outputs alongside the existing `.next/**` entries.
- **[target]** `docker-compose.yml` — Loki (3100), Grafana (3002), Tempo (3200), Mimir (9009), with provisioned Grafana datasources.
- **[target]** `drizzle.config.ts`, an initial empty migration, `.env.example`, `lefthook.yml`, lint-staged and Commitlint configuration.
- **[target]** One ADR in `.adrs/`, plus updates to `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/QA.md` and `README.md` so no document describes the removed apps or OXLint/OXFmt as the chosen stack.

## Behavior

### Happy path

1. A developer checks out the repo on Node >= 22 (verified local version: `v22.22.1`) and runs `npm install`.
2. `npm run lint`, `npm run code:fix`, `npm run types:check`, `npm run build` and `npm run test` all exit 0.
3. `npm run infra:up` starts Supabase local (`supabase start`, CLI resolved from the pinned devDependency) and `docker compose up -d` for the LGTM services.
4. `npm run db:migrate` applies the initial Drizzle migration to the Supabase Postgres at the documented local URL.
5. `npm run dev` starts the API on 3000 and the client on 5173; `GET /` returns the JSON contract and `/` renders the heading.
6. `npm run infra:down` runs `supabase stop` and `docker compose down` without `-v`, stopping services and preserving volumes.

### Edge cases & failure modes

- **Empty / single / very large data:** no domain data exists. The initial migration creates no tables; an empty database is the expected state. There is no list or bulk endpoint.
- **Stale / missing / untrusted data:** no external data is consumed. `.env.example` carries documented local defaults; a missing `.env` falls back to those defaults. No connector is assumed to exist.
- **Duplicate submit / retries / concurrency / idempotency:** `infra:up` is idempotent (`supabase start` and `docker compose up -d` tolerate already-running services); `db:migrate` is idempotent through the Drizzle migration journal; `code:fix` and `test` have no shared mutable state.
- **Recoverable vs operator-only failures:** a bound local port or a bad commit message is developer-fixable; a stopped Docker daemon or a missing pinned CLI after install is an environment/operator issue and must surface the underlying tool error rather than a silent skip.

### Loading, empty & offline states

Not applicable — the client renders one static heading with no asynchronous data, and infrastructure commands stream their own CLI output. No retry, offline or empty-list UI exists in this foundation.

## UX & accessibility

- Entry point: `/` on the Vite client (port 5173), rendering one semantic `<h1>Hello World</h1>`; document title is "Hello World".
- Keyboard path, focus order and error announcements: not applicable — there are no interactive controls, forms or error states.
- Responsiveness: a single heading at desktop, tablet and mobile widths; no fixed-width layout.
- Design tokens/components: none introduced. `DESIGN.md` and `DESIGN_SYSTEM.md` remain [target]; no dark mode, palette or shadcn setup in this spec.

## Technical approach

- **Architecture and layer ownership:** NestJS standard skeleton now (`AppModule` + `AppController`); `interface`/`application`/`domain`/`infrastructure` layering stays documented as a target in `.docs/DEVELOPMENT.md` and is created when the first real feature lands. The Vite client is independent of the starter `@repo/ui` components for this static page.
- **Public seam / interface:** `GET /` on port 3000; the root npm script names in this spec; the provisioned Grafana datasources.
- **Data flow, persistence, and source traceability:** no persisted domain data. Drizzle is configured against the Supabase Postgres URL from `.env`; the initial migration is empty. No product connector or source tracing is involved.
- **External boundaries and adapters (do not assume a connector exists):** Supabase CLI (pinned devDependency) and Docker Compose for LGTM are the only external boundaries. No Google/Notion/Jira connector is set up here.
- **Security, privacy, and observability:** local defaults documented in `.env.example` are development-only and must never be reused in production; no secret is committed. Grafana datasources are provisioned but no application instrumentation is added yet.
- **Migration, rollout, flag, and rollback:** no data migration or feature flag. Removing the starter apps is reversible via git and `npm install`; `infra:down` preserves volumes; rollback is reverting the commit.

## Decisions

- **D-1 — Replace `apps/web` and `apps/docs` with `apps/api` and `apps/app`:** matches the target layout in `.docs/ARCHITECTURE.md:53-54` and removes unused starters. Rejected: keeping all four apps; repurposing `apps/web` as the Vite client. ADR: yes. Verified by: both removed apps' `package.json`, `.docs/ARCHITECTURE.md:19-20,53-54`.
- **D-2 — Keep ESLint + Prettier as the lint/format stack:** `code:fix` runs `eslint --fix` plus Prettier; OXLint/OXFmt is rejected despite the old target row. Rejected: OXLint+OXFmt; ESLint+OXFmt hybrid. ADR: yes. Verified by: root `package.json:8,12`, `.docs/QA.md:29-30` (rows to be updated).
- **D-3 — Vitest + Supertest smoke tests only:** covers the HTTP contract and one client render without browser infrastructure. Rejected: adding Playwright now; Vitest without Supertest. ADR: no. Verified by: `.docs/QA.md:31-32`, original criterion "teste sendo executado mesmo que muito simples por hora".
- **D-4 — Set `engines.node` to `>=22`:** aligns the manifest with the verified environment (`v22.22.1`) so build/test are runnable. Rejected: `>=24` (blocks local validation), `>=20` (overly broad). ADR: no. Verified by: `node --version`, root `package.json:17`.
- **D-5 — Include Lefthook + lint-staged + Commitlint; defer CI:** enforces local gates without depending on external CI secrets. Rejected: including CI now; deferring hooks too. ADR: no. Verified by: `.docs/ARCHITECTURE.md:57`, `.docs/RULES.md:30-33`.
- **D-6 — Add `code:fix`/`types:check` as aliases while keeping `lint`/`check-types`:** avoids breaking existing scripts and docs; `types:check` delegates to `turbo run check-types`. Rejected: renaming the canonical scripts; plain non-Turbo aliases. ADR: no. Verified by: root `package.json:5-9`, `.docs/QA.md:29-30`, installed Turbo docs on side-effect tasks.
- **D-7 — Supabase CLI as a pinned devDependency wrapped by `infra:up`/`infra:down`; `down` without `-v`:** keeps the CLI versioned and preserves local data. Rejected: global CLI; folding Supabase into the LGTM compose file. ADR: no. Verified by: original criterion "`supabase start`", environment check (no global CLI).
- **D-8 — LGTM = Loki + Grafana + Tempo + Mimir on 3100/3002/3200/9009; API 3000, client 5173, Supabase Studio 54323/Postgres 54322:** matches the documented target and avoids port collisions. Rejected: Prometheus instead of Mimir; Grafana + Loki only. ADR: no. Verified by: `.docs/ARCHITECTURE.md:58`.
- **D-9 — Drizzle Kit applies migrations against Supabase Postgres:** matches the target ORM and gives `db:migrate` one deterministic command. Rejected: Supabase SQL migrations; adding schema type generation now. ADR: no. Verified by: `.docs/ARCHITECTURE.md:55`.
- **D-10 — `GET /` returns `{"message":"Hello World"}`; client renders `<h1>Hello World</h1>`:** literal, observable contract in `en-US`. Rejected: pt-BR text; `text/plain` response. ADR: no. Verified by: original criteria lines 14-15, `.docs/DEVELOPMENT.md:38`.
- **D-11 — Minimal scaffolding:** no domain layers, router or design system in this foundation. Rejected: creating empty layers now; adding router/shadcn. ADR: no. Verified by: original "O que não fazer — Implementar feature completa".
- **D-12 — Keep `@repo/ui`, `@repo/eslint-config`, `@repo/typescript-config` unchanged:** they are the shared libraries the original spec refers to. Rejected: renaming to `@coders/*`; deleting `@repo/ui`. ADR: no. Verified by: `packages/*/package.json`.
- **D-13 — Keep Next.js-only dependencies dormant:** explicit user choice overrides the original "limpar libs não ultilizadas" item; revisit when a concrete cost appears. Rejected: removing `next`, `@next/eslint-plugin-next` and the `next-js` export; renaming configs. ADR: no. Verified by: user decision in refine-spec round 4; `apps/web/package.json`, `packages/eslint-config/package.json`.
- **D-14 — Deliver one ADR and update affected docs/README in the same change:** required by the repository rules for structural decisions and doc coherence. Rejected: docs only; ADR only. ADR: yes (the ADR itself). Verified by: `.docs/RULES.md:23`, `.docs/AGENTS.md` rule 3.
- **D-15 — `.env.example` with local defaults, no env-validation library:** sufficient for local-only development. Rejected: Zod bootstrap validation; hard-coded credentials without `.env.example`. ADR: no. Verified by: `.docs/DEVELOPMENT.md:48`.

## Test strategy & seams

- **HTTP seam (integration, Supertest against `AppModule`):** catches the `GET /` status, content type and body, plus the 404 case; misses real socket/port binding. Independent source of truth: the literal `{"message":"Hello World"}` in AC-1.
- **Client render seam (unit, Vitest):** catches the heading and document title; misses browser layout and accessibility at runtime. Source of truth: AC-3 literals.
- **Script seam (shell, invoked from a clean checkout):** catches missing or misnamed root scripts; misses cross-OS shell differences. Source of truth: the command names in this spec.
- **Infra seam (shell + HTTP probe, `docker compose ps`, `supabase status`, Grafana health):** catches services not starting or datasources not provisioned; misses data correctness. Source of truth: the documented ports in D-8.
- **Migration seam (shell, `db:migrate` twice):** catches an inapplicable or non-idempotent migration; misses schema correctness because the initial migration is empty. Source of truth: Drizzle's migration journal.
- **Hook seam (manual QA, commitlint CLI with a valid and an invalid message):** catches a misconfigured `commit-msg` hook; misses editor-specific hook wiring. Source of truth: Conventional Commits rule in `.docs/RULES.md:33`.

## Acceptance criteria

- [ ] AC-1 — Given `apps/api` is implemented, when a developer starts it and sends `GET /` on port 3000, then the response is HTTP 200 with `Content-Type: application/json` and body `{"message":"Hello World"}`.
- [ ] AC-2 — Given the API is running, when `GET /does-not-exist` is requested, then the service returns a JSON 404 and stays up.
- [ ] AC-3 — Given `apps/app` is running on port 5173, when a browser opens `/`, then the page contains a single `<h1>Hello World</h1>` and the document title is "Hello World".
- [ ] AC-4 — Given a clean checkout on Node v22.22.1 with `engines.node` set to `>=22`, when `npm install` runs, then installation completes with `api`, `app` and the three `@repo/*` packages present as workspaces and no engine-version error.
- [ ] AC-5 — Given the monorepo is installed, when `npm run lint` is executed, then it exits 0 with no lint errors in any workspace.
- [ ] AC-6 — Given a deliberately misformatted source file, when `npm run code:fix` is executed, then the file is rewritten to satisfy lint/Prettier and a subsequent `npm run lint` exits 0.
- [ ] AC-7 — Given the monorepo is installed, when `npm run types:check` is executed, then it exits 0 and performs the same workspace type checks as `npm run check-types`.
- [ ] AC-8 — Given the monorepo is installed, when `npm run build` is executed, then every workspace builds successfully and the Vite client emits `apps/app/dist/**`.
- [ ] AC-9 — Given the smoke tests are committed, when `npm run test` is executed, then Vitest runs and all tests pass, including a Supertest assertion of the AC-1 body.
- [ ] AC-10 — Given Docker and the pinned Supabase CLI are available, when `npm run infra:up` is executed, then Supabase local services and the four LGTM containers are running on the ports listed in D-8.
- [ ] AC-11 — Given infra is up, when Grafana at `http://localhost:3002` is inspected, then Loki, Tempo and Mimir datasources are present and provisioned.
- [ ] AC-12 — Given infra is up, when `npm run db:migrate` is executed twice, then Drizzle applies the initial migration on the first run and reports no pending migrations on the second.
- [ ] AC-13 — Given infra is up, when `npm run infra:down` is executed, then Supabase and LGTM containers stop and their Docker volumes still appear in `docker volume ls`.
- [ ] AC-14 — Given Lefthook, lint-staged and Commitlint configs are committed, when a developer commits a staged file with message `feat: add foundation`, then pre-commit runs lint-staged and `commit-msg` accepts it; when the message is `banana`, then the commit is rejected.
- [ ] AC-15 — Given the ADR and doc updates are committed, when a reviewer reads `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/QA.md` and `README.md`, then no file presents `apps/web`/`apps/docs` as current apps, no file names OXLint/OXFmt as the chosen formatter, and the ADR records D-1 and D-2.
- [ ] AC-16 — Given the starter apps were removed, when `ls apps` is executed, then only `api` and `app` appear, while `@next/eslint-plugin-next` and the `./next-js` export of `@repo/eslint-config` remain installed and configured (D-13).
- [ ] AC-17 — Given `.env.example` is present, when a developer copies it to `.env` without edits and starts the stack, then the API connects to the documented local Supabase Postgres and Grafana uses the documented development credentials.
- [ ] AC-18 — Given the foundation is complete, when either app is reviewed, then no expert, connector, task or artifact module exists and no feature beyond the two hello-world contracts was implemented.

## Open questions & assumptions

None — every branch was resolved by an explicit user decision, a verified repository fact, or an accepted recommendation. Deliberate deferrals are recorded under Goals / non-goals and in the handoff below.

## Handoff to implement-me

- **Constraints:** do not introduce OXLint/OXFmt, Playwright, CI, domain layers, router, shadcn or product features. Keep the `lint`/`check-types` scripts and the `@repo/*` packages. Keep Next.js-only dependencies dormant (D-13). Register mutating `code:fix` as a non-cached Turbo task per the installed Turbo docs; keep `types:check` as an alias of `check-types`.
- **Temporary behavior:** hello-world endpoints only; no application instrumentation yet; local-only `.env` defaults; empty initial migration.
- **Follow-ups for later specs:** Playwright E2E, CI workflow, Nest domain layers, design tokens/shadcn, and a decision on removing the dormant Next.js dependencies.
- **Manual QA data:** Node `v22.22.1`, Docker `29.8.0`, Compose `v5.5.1`; ports API 3000, client 5173, Loki 3100, Grafana 3002, Tempo 3200, Mimir 9009, Supabase Studio 54323, Postgres 54322; expected API body `{"message":"Hello World"}` and client heading `Hello World`.
- **Same-change deliverables:** one ADR in `.adrs/` and updates to `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/QA.md` and `README.md`, as required by `.docs/RULES.md` and `.docs/AGENTS.md`.
