# Implementation plan — 006-route-protection

- **Spec:** specs/006-route-protection.md
- **Status:** proposed
- **Created:** 2026-11-26

## Objective

Every `/app/*` page renders only after `GET /api/v1/auth/me` accepts the stored `auth_token`, while all `/auth/*` pages stay public except sign-in and sign-up, which redirect an already-authenticated user home. A 401 clears the token and redirects to sign-in; a network failure or 5xx keeps the token and offers a keyboard-reachable Retry control, with accessible loading/error states throughout.

## Context loaded

- **AGENTS.md files read:** `/AGENTS.md` (Turborepo rules), `.docs/AGENTS.md` (context-pack index). No nested `AGENTS.md` exists under `apps/` or `packages/` (verified with `find`).
- **Context pack read:** `ARCHITECTURE.md`, `DEVELOPMENT.md`, `RULES.md`, `QA.md`, `BUSINESS.md`, `DESIGN.md`, `DESIGN_SYSTEM.md`.
- **Skills loaded:** `implement-me`, `feature-concept` (ready-spec alignment pass only), `tdd` (seams/red-green), `frontend-design` (accessible loading/error states using existing tokens). Not loaded: `shadcn` and Playwright (explicitly out of scope), Next.js skills (this is a Vite app), `refine-spec` (no open questions).
- **Verified in code/config:**
  - `apps/app/src/App.tsx`: `/` already maps to `<Navigate to="/auth/sign-in" replace />` per ADR 0006; five `/auth/*` routes are public; `/app/home` renders the unguarded `Hello World` placeholder (`AppHomePage`).
  - `.adrs/0006-landing-route.md`: the `/` redirect is accepted and `/app/home` keeps its placeholder — the landing change must not be reverted.
  - `apps/app/src/auth/api-client.ts`: `AUTH_TOKEN_KEY = "auth_token"`; `getAuthToken`/`setAuthToken`/`clearAuthToken`; `apiFetch` adds `Authorization: Bearer {token}` and clears the token on any 401. This is the validation seam to reuse.
  - `apps/api/src/auth/interface/sign-in.controller.ts:51-61`: `GET me` is guarded by `SessionGuard`; it returns the session or a 401. No API change is needed.
  - `apps/app/package.json`: `react-router-dom@^7.18.7`, React 19, `@testing-library/react`, `jsdom`; `apps/app/vite.config.ts` sets `environment: "jsdom"`. No dependency additions required.
  - `apps/app/src/App.test.tsx` and `apps/app/src/auth/api-client.test.ts`: existing RTL patterns (`MemoryRouter`, `vi.stubGlobal("fetch", ...)`, `localStorage.clear()` in `afterEach`). The current "renders the unguarded placeholder at /app/home" test must be updated because the route becomes guarded.
  - `apps/app/src/index.css`: existing CSS variables (`--linen`, `--parchment`, `--powder-blue`, `--soft-blush`, `--error-ink`) and a shared `button:focus-visible` outline — reuse for the new states.
  - `package.json`, `turbo.json`, `.docs/QA.md`: real QA commands and recommended order (`lint` → `check-types` → `test` → `build` → Prettier check).
- **Target items not yet implemented:** `apps/app/src/auth/route-guard/` (guard, guest-only wrapper and tests); guarded `/app/*` wiring; documented public/private boundary and route-protection QA steps.

## Decisions carried from the spec

- D-1 — Validate through `GET /auth/me` on each `/app/*` navigation so version invalidation from 002/003/005 is honoured; ADR: not needed (seam already exists).
- D-2 — Redirect only `/auth/sign-in` and `/auth/sign-up` for authenticated users; confirmation/forgot/reset links stay reachable; ADR: not needed.
- D-3 — Drop the original destination on 401 (no `returnTo`); 002 keeps ownership of the post-login redirect; ADR: not needed.
- D-4 — Loader while validating; Retry on network failure/5xx with the token preserved; ADR: not needed.
- D-5 — Client-only guard; no global API middleware because there are no private product endpoints; ADR: not needed.
- D-6 — No npm workspace, endpoint or migration changes; reuse existing router, `apiFetch` and `/auth/me`; ADR: not needed.
- Repository facts used: `/` redirects to `/auth/sign-in` — verified in `apps/app/src/App.tsx:20` and `.adrs/0006-landing-route.md`; `auth_token` cleanup on 401 already lives in `apiFetch` — verified in `apps/app/src/auth/api-client.ts:36-38`; `GET me` returns 401 without a valid session — verified in `apps/api/src/auth/interface/sign-in.controller.ts:51-61`.

## Approach

Add a small, reusable client guard under `apps/app/src/auth/route-guard/` and apply it as a `/app` layout route with `<Outlet />`, so every current and future private page is protected without changing the placeholder component. The guard has four states — `checking`, `authenticated`, `unauthenticated`, `unavailable` — and reuses `apiFetch("/api/v1/auth/me")` so Bearer construction and 401 cleanup stay in one place; it renders no private content until a 200 arrives. A separate guest-only wrapper is applied only to the two credential-entry routes and redirects on stored-token presence (no second `/auth/me` call, avoiding a validation loop). Loading and failure UI use existing CSS variables and semantic `role="status"` / `role="alert"` markup. API, schema, email, sign-in/confirmation/reset logic and the ADR 0006 `/` redirect remain untouched; docs are updated in the same change.

## Work breakdown (vertical slices)

### Slice 1 — No token: `/app/*` redirects to sign-in without private content

- **Files:** `apps/app/src/auth/route-guard/RouteGuard.tsx` (new; minimal token-presence check and `<Navigate to="/auth/sign-in" replace />`), `apps/app/src/App.tsx` (layout route `/app` wrapping `<Outlet />` in `<RouteGuard>`), `apps/app/src/App.test.tsx` (replace the unguarded-placeholder assertion).
- **Seam / test:** render `<App />` in `MemoryRouter` at `/app/home` with empty `localStorage`; expect the "Sign in" heading and no "Hello World" heading. Catches AC-1; misses real browser navigation timing (manual QA covers it).
- **Verification:** `npm run test -w app -- App.test.tsx`, then `npm run test`.

### Slice 2 — Stored token: validate through `/auth/me` with an accessible loader before rendering

- **Files:** extend `RouteGuard.tsx` (`checking`/`authenticated` states, `useEffect` calling `apiFetch("/api/v1/auth/me")`, `role="status"` "Checking your session…"), new `apps/app/src/auth/route-guard/RouteGuard.test.tsx` (mocked fetch).
- **Seam / test:** mocked `fetch` returning 200; assert the request URL contains `/api/v1/auth/me` and carries `Authorization: Bearer {TOKEN}`, that `role="status"` shows "Checking your session…" while the promise is pending, and that the "Hello World" placeholder appears only after resolution. Catches AC-2 and AC-5; misses real JWT verification (covered by 002).
- **Verification:** `npm run test -w app -- RouteGuard.test.tsx`, then `npm run test`.

### Slice 3 — 401 clears the token and redirects, including stale tokens

- **Files:** extend `RouteGuard.tsx` (`401` → `unauthenticated` + `<Navigate replace />`; rely on `apiFetch`'s existing `clearAuthToken()`), `RouteGuard.test.tsx` (401 case plus a stale-token-after-later-login/reset case).
- **Seam / test:** mocked 401; assert `localStorage.getItem("auth_token") === null`, the sign-in heading is shown and no private content renders. Catches AC-3 and AC-4.
- **Verification:** `npm run test -w app -- RouteGuard.test.tsx`.

### Slice 4 — Network failure or 5xx: retry state keeps the token

- **Files:** extend `RouteGuard.tsx` (`unavailable` state, `role="alert"` "Unable to verify your session.", keyboard-reachable "Retry" button that repeats the GET), `RouteGuard.test.tsx` (rejected `fetch` and 500 cases, Retry click), `apps/app/src/index.css` (small styles for the two states using existing tokens).
- **Seam / test:** mocked rejected request and mocked 500; assert the alert text, that the stored token is unchanged, and that clicking Retry issues a second `/auth/me` call. Catches AC-6; misses screen-reader announcement and visual focus (manual QA).
- **Verification:** `npm run test -w app -- RouteGuard.test.tsx`, then manual Tab/focus check in the browser.

### Slice 5 — Authenticated users leave credential pages; recovery pages stay public

- **Files:** new `apps/app/src/auth/route-guard/GuestOnlyRoute.tsx` (token-presence redirect to `/app/home`), `apps/app/src/App.tsx` (wrap only `/auth/sign-in` and `/auth/sign-up`), `apps/app/src/App.test.tsx` and/or `RouteGuard.test.tsx` (route-boundary cases).
- **Seam / test:** render with a stored token — sign-in/sign-up redirect home without their forms; confirm-account, forgot-password and reset-password still render and issue no `/auth/me` call; with no token every `/auth/*` page renders without validation. Catches AC-7, AC-8 and AC-9.
- **Verification:** `npm run test -w app` (full client suite, including the updated `/` redirect test).

### Slice 6 — Documentation and QA coherence

- **Files:** `.docs/ARCHITECTURE.md` (public `/auth/*` vs guarded `/app/*`, guard location), `.docs/DEVELOPMENT.md` (validation seam and client-only scope), `.docs/QA.md` (replace the "Unguarded placeholder page" probe; add route-protection checks), `README.md` (replace "unguarded placeholder until route protection arrives").
- **Seam / test:** manual review against AC-10; no automated test.
- **Verification:** full quality checks below plus the manual QA steps.

## Dependencies & additions

None. Reuse `react-router-dom` (already in `apps/app/package.json`), the existing `auth_token` key and `apiFetch` helper, `GET /api/v1/auth/me`, Vitest + React Testing Library + jsdom, and existing CSS variables. No new npm workspaces, endpoints, migrations, environment variables or infra changes.

## Risks, assumptions & follow-ups

- **Assumption:** the guest-only redirect uses token presence, not a second `/auth/me` call. A stale token can briefly redirect to `/app/home`, where the private guard clears it and sends the user back to sign-in; this avoids the validation loop forbidden by the spec. If a reviewer requires server validation on the credential pages, that is a scope change needing a spec update.
- **Risk:** `apiFetch` already clears the token on any 401 — the guard must treat 401 as unauthenticated and must not also classify it as `unavailable`, and must not clear the token on 5xx/network errors. Mitigated by explicit status branching in Slice 3/4 tests.
- **Risk:** React 19 `StrictMode` double-invokes effects in dev; validation is a read-only GET, but a cancellation flag is needed so a late response cannot flip state after navigation or unmount. Keep tests in `MemoryRouter` without StrictMode and cover the flag in review.
- **Risk:** tests must not assume a hard-coded API host if `VITE_API_URL` is set; assert `expect.stringContaining("/api/v1/auth/me")` and the `Authorization` header rather than a fixed origin.
- **Constraint:** do not reintroduce a client hello-world page at `/` — ADR 0006 owns that redirect and AC-11 concerns the `/app/home` placeholder only. Do not modify sign-in redirect logic, confirmation/reset pages, API, schema, `EmailService`, `returnTo`, global API middleware, shadcn/ui, Playwright or sign-out.
- **Deliberate follow-ups:** sign-out, session refresh/rotation, OAuth, MFA, email change, confirmation resend, and server-side validation for future private product endpoints (each private API must validate the Bearer token itself).

## ADR candidates

- None required. All six spec decisions are explicitly "ADR: no"; ADR 0003 covers localStorage token storage, ADR 0006 the landing route and ADR 0007 the reset invalidation. If implementation settles on the `/app` layout route as a reusable project pattern, document it in `.docs/ARCHITECTURE.md` rather than adding an ADR unless a new architectural tradeoff appears.

## Quality checks (from QA.md)

Recommended order from `.docs/QA.md`; run from repository root on Node `>=22`.

- [ ] `npm run lint`
- [ ] `npm run check-types` (alias: `npm run types:check`)
- [ ] `npm run test` (targeted during slices: `npm run test -w app -- RouteGuard.test.tsx`)
- [ ] `npm run build` (assert `apps/app/dist/**` exists)
- [ ] `npx prettier --check "**/*.{ts,tsx,md}"` (use `npm run format` only to fix)
- [ ] `npm run code:fix` only if intentionally rewriting files, then re-run `npm run lint`
- [ ] API still reachable: `curl http://localhost:3000/` → `{"message":"Hello World"}` (no API changes in this spec)

## Manual QA

With API on 3000 and client on 5173 (`npm run dev`, plus `npm run infra:up` and `npm run db:migrate` where an account/session is needed):

1. Clear `localStorage.auth_token`, open `http://localhost:5173/app/home` → URL becomes `/auth/sign-in`, the sign-in form renders and no "Hello World" content appears.
2. Sign in with a confirmed account → the browser lands on `/app/home`; "Checking your session…" (`role="status"`) is visible while `/auth/me` is in flight, then the unchanged "Hello World" placeholder renders and `localStorage.auth_token` holds the JWT.
3. Open `http://localhost:5173/` → it still redirects to `/auth/sign-in` (ADR 0006); the API `GET /` still returns `{"message":"Hello World"}`.
4. While signed in, open `/auth/sign-in` and `/auth/sign-up` → both redirect to `/app/home` before their forms appear; no second-login form is shown.
5. While signed in, open `/auth/forgot-password`, `/auth/reset-password?token=any-value` and `/auth/confirm-account?token=invalid-value` → each page renders with its own message and no redirect or extra `/auth/me` call (use invalid/dummy tokens so no real link is consumed).
6. Sign in from a second browser profile, then reload `/app/home` in the first → the first token is rejected with 401, `auth_token` is cleared and the browser redirects to sign-in.
7. Stop the API (or block `localhost:3000`) and open `/app/home` with a stored token → "Unable to verify your session." (`role="alert"`) and a "Retry" button appear; the token remains in `localStorage`. Restore the API, press Retry (Tab to it and confirm visible focus) → the page renders after the successful check.
8. With no token, open each `/auth/*` page and watch the network tab → no `/auth/me` request is made; with a valid token, verify the guard's request carries `Authorization: Bearer {TOKEN}` and that the token never appears in console logs.

## Rollback

Revert the commit: `App.tsx` returns to unguarded `/app/*` and the guest-only redirect disappears; no persisted data, schema or API contract changes to undo. The ADR 0006 `/` → `/auth/sign-in` redirect predates this change and must remain intact — do not roll it back with the guard.

## Approval

- [ ] Approval pending — orchestrator/user gate before implementation (this subagent stops after the plan).
