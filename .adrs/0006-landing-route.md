# ADR 0006 — Sign-in as the client landing route

- **Status:** accepted
- **Date:** 2026-11-26
- **Supersedes:** the client part of `specs/000-foundation.md` AC-3 (the API `GET /` contract in AC-1 is unchanged)

## Context

The client rendered a `Hello World` page at `/`, while the sign-in form already existed at `/auth/sign-in`. Opening the project at `http://localhost:5173/` therefore showed the foundation placeholder instead of the login flow the user expects as the entry point.

## Decision

`apps/app/src/App.tsx` maps `/` to `<Navigate to="/auth/sign-in" replace />`. The canonical sign-in URL stays `/auth/sign-in`; `/app/home` keeps its placeholder, and the API still answers `GET /` with `{"message":"Hello World"}`.

Rejected alternatives: duplicating the sign-in form at `/` (two URLs for one flow), changing the API root (breaks the AC-1 contract), and configuring only Vite's dev server to open `/auth/sign-in` (would not fix navigation from a bookmarked root URL).

## Consequences

- Visiting `/` replaces the history entry with `/auth/sign-in`, so Back does not return to a placeholder.
- `App.test.tsx`, README, `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md` and `.docs/QA.md` describe the redirect instead of the removed client hello-world page.
- The browser tab title remains "Hello World" from `index.html`; changing it is a separate visual decision.

## Verification

- `npm run lint`, `npm run check-types`, `npm run test`, `npm run build` pass.
- Open `http://localhost:5173/` → the URL becomes `/auth/sign-in` and the "Sign in" form is visible.
