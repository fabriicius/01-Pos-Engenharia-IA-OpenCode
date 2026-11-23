# ADR 0001 — Foundation layout and lint/format stack

- **Status:** accepted
- **Date:** 2026-11-23
- **Spec:** `specs/000-foundation.md`
- **Decisions recorded:** D-1, D-2 (with context for D-4, D-7, D-13)

## Context

The repository started as a Turborepo starter with two Next.js apps (`apps/web`, `apps/docs`), three `@repo/*` shared packages, and only `lint`/`check-types`/`build`/`dev` as root commands. The target layout in `.docs/ARCHITECTURE.md` already described a React/Vite client at `apps/app` and a NestJS API at `apps/api`, but neither existed. The foundation spec requires a clean-checkout developer to install dependencies, run every quality script, start local infrastructure, apply migrations, and reach both hello-world contracts using only documented commands.

Two decisions are architectural and therefore require an ADR under `.docs/RULES.md`: which applications occupy `apps/*`, and which lint/format stack the repository standardizes on.

## Decision

### D-1 — Replace `apps/web` and `apps/docs` with `apps/api` and `apps/app`

- Delete both starter Next.js apps and create:
  - `apps/api` — NestJS skeleton (`AppModule` + `AppController`) on port 3000, exposing `GET /` → `{"message":"Hello World"}` and a JSON 404 for unknown routes.
  - `apps/app` — React + Vite + TypeScript client on port 5173 rendering a single `<h1>Hello World</h1>` with document title "Hello World".
- Keep the three existing shared packages (`@repo/ui`, `@repo/eslint-config`, `@repo/typescript-config`) unchanged.
- Rejected alternatives: keeping all four apps, or repurposing `apps/web` as the Vite client. Both would leave unused starter code and contradict the documented target layout.
- Reversibility: both apps are recoverable from git history; no data migration is involved.

### D-2 — Keep ESLint 10 + Prettier 3.9.6 as the lint/format stack

- `code:fix` runs `eslint . --fix` followed by Prettier write in each app; root `format` remains a Prettier write command.
- Lint configuration is ESLint 10 flat config, reusing `@repo/eslint-config/base` and `@repo/eslint-config/react-internal` with Babel parser plugins for TS, JSX and legacy decorators.
- Rejected alternatives: OXLint + OXFmt, and an ESLint + OXFmt hybrid. The toolchain is already installed, working and documented; introducing a second formatter provides no concrete benefit in this foundation.
- Consequence: `.docs/QA.md` and `.docs/ARCHITECTURE.md` no longer list OXLint/OXFmt as the chosen stack.

### Supporting decisions (context, not separate ADRs)

- **D-4:** `engines.node` is `>=22`, matching the verified local Node `v22.22.1`.
- **D-7:** the Supabase CLI is a pinned root devDependency wrapped by `infra:up`/`infra:down`; `down` runs `supabase stop && docker compose down` **without** `-v` so local volumes are preserved.
- **D-13:** Next.js-only dependencies (`next`, `@next/eslint-plugin-next`) and the `./next-js` export of `@repo/eslint-config` stay installed and configured but unused. This is an explicit user decision that overrides the original "remove unused libraries" item; revisit only when a concrete cost appears.

## Consequences

- Positive: `apps/*` matches the documented target; every quality command has one deterministic implementation; local infra and migration commands are reproducible and idempotent.
- Positive: linting actually parses TypeScript, TSX and Nest decorators (the initial flat configs silently ignored these files; the fix is part of this decision).
- Negative: TypeScript 7.0.2 cannot run the Nest CLI, so `apps/api` builds with `tsc -p tsconfig.build.json` and runs in dev with `tsx watch src/main.ts` instead of `nest build`/`nest start`.
- Follow-ups deferred to later specs: Playwright E2E, CI workflow, Nest domain layers, design tokens/shadcn, and a future decision on removing the dormant Next.js dependencies.

## Verification

- `ls apps` → only `api` and `app`.
- `npm run lint`, `npm run check-types`, `npm run types:check`, `npm run test`, `npm run build`, `npm run code:fix` all exit 0; Vite emits `apps/app/dist/**`.
- `npm run infra:up` → Supabase + four LGTM containers on the documented ports with Grafana datasources provisioned; `npm run db:migrate` is idempotent; `npm run infra:down` preserves volumes.
- `@next/eslint-plugin-next` and `packages/eslint-config`'s `./next-js` export remain present.
