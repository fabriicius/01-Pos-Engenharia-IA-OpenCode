# Development

> Engineering standards for code changes. Distinguish **[current]** repo behavior from **[target]** architecture.

## Principles

- **DRY / avoid premature abstraction**: reuse logic when it reduces real duplication; avoid WET copy-paste.
- **Clean code**: clear naming, small focused units, readable control flow.
- **SOLID**: apply where it improves maintainability; do not over-engineer simple code.
- **Consistency**: follow existing patterns in the touched workspace before introducing new ones.

## Current repository practices

- Monorepo managed by npm workspaces + Turborepo; Node `>=22`.
- Apps: `apps/api` (NestJS API on port 3000: `GET /` hello world plus versioned auth endpoints) and `apps/app` (React + Vite client on port 5173: `/`, `/auth/sign-up` and `/app/home`).
- Shared packages: `@repo/ui`, `@repo/eslint-config`, `@repo/typescript-config`.
- Lint with ESLint 10 and format with Prettier; `npm run code:fix` runs both with `--fix`/write. OXLint/OXFmt are not used (ADR 0001). For TypeScript files, ESLint's `no-undef` rule is disabled because `check-types` resolves identifiers and globals more accurately than the Babel parser (ADR 0002).
- Type-check with TypeScript through `npm run check-types` or its alias `npm run types:check`.
- Test with Vitest (`npm run test`); the API uses Supertest against `AppModule` plus use-case unit tests with in-memory ports, the client uses React Testing Library in jsdom.
- Local infra: `npm run infra:up` (Supabase + LGTM), `npm run db:migrate`, `npm run infra:down`. Copy `.env.example` to `.env` first.
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
- Email is sent through the `EmailService` port. `EMAIL_PROVIDER` selects `mailtrap` by default in development/test and `resend` in production; missing credentials select the console fallback. `APP_URL` builds confirmation links. See `.env.example` and ADR 0002.

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
