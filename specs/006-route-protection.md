# Route Protection — Public Auth Routes and Private App Routes

- **Spec:** 006-route-protection
- **Status:** ready-for-implementation
- **Created:** 2026-11-24
- **Last updated:** 2026-11-24
- **Source:** feature-concept session (delegated by create-spec from the approved authentication breakdown)

## Problem & motivation

The router created in 001 has a `/auth/*` public area and an `/app/home` placeholder, but nothing enforces the rule that every non-authentication page is private. A visitor can open `/app/home` without a session, and a signed-in user sees sign-in/sign-up forms that would create a second session and invalidate the first. The observable signal that this is fixed: with no stored token `/app/home` redirects to `/auth/sign-in`; after sign-in it opens normally; `/auth/*` pages stay reachable without a session; and a stale token rejected by `GET /api/v1/auth/me` is cleared before any private content renders.

## Goals / non-goals

- **Goals:**
  - Add a client-side guard for every `/app/*` route that reads the `auth_token` key from `localStorage` and validates it through `GET /api/v1/auth/me` with an `Authorization: Bearer` header.
  - On 401, clear the stored token and navigate to `/auth/sign-in` without rendering private content; on network failure, keep the token and offer a retry.
  - Show an accessible "Checking your session…" state while validation is in flight.
  - Keep `/auth/*` public, but redirect already-authenticated users away from `/auth/sign-in` and `/auth/sign-up` to `/app/home`.
  - Keep `/auth/confirm-account`, `/auth/forgot-password` and `/auth/reset-password` reachable even when a token is stored, so recovery links from 003/004/005 keep working.
  - Document the public/private boundary and the client-only scope in `.docs/*` and `README.md`.
- **Non-goals:**
  - Issuing tokens, checking passwords or creating sessions — owned by `002-sign-in`; confirmation-created sessions are owned by `003-confirm-account`.
  - Changing the sign-in success redirect or adding a `returnTo` parameter — `002-sign-in` always navigates to `/app/home`.
  - Protecting API endpoints with a global middleware: there are no private product endpoints yet, and future ones must validate the Bearer token themselves.
  - Sign-out, session refresh/rotation, OAuth/social login, MFA, email change and rate limiting — out of scope for this initiative because they were not requested.
- **Explicitly out of scope:**
  - shadcn/ui, Playwright E2E, a server-rendered session layer and any expert/connector/task/artifact feature from `.docs/BUSINESS.md`.

## Users & jobs to be done

- **Visitor without a session:** try to open a private page and land on sign-in with no private content flashing.
- **Signed-in user:** open `/app/home` directly and stay there; open sign-in/sign-up and be taken home instead of starting a second session.
- **User following a recovery or confirmation link while signed in:** still reach the `/auth/*` page from 003/004/005.
- **Not served:** users whose sessions were replaced by a later login or a password reset — their old token is correctly rejected and cleared; users of future private API endpoints, which need their own server-side validation.

## Domain model & vocabulary

- **Public route:** a path under `/auth/*`, reachable without a token. `sign-in`, `sign-up`, `confirm-account`, `forgot-password` and `reset-password` are public.
- **Private route:** a path under `/app/*`, rendered only after `GET /api/v1/auth/me` returns 200 for the stored token.
- **Session validation:** the 002 seam that compares the JWT signature, expiry and `ver` claim with `users.session_version`. Invariant: a token replaced by a later login or invalidated by a password reset is rejected here before private content renders.
- **Guard state:** `checking`, `authenticated`, `unauthenticated` and `unavailable` (network failure). Invariant: private content renders only in `authenticated`.
- Do not conflate a public route with an unguarded route: `/auth/*` is intentionally unguarded except for the two credential-entry pages, while `/app/*` is always guarded.
- All routes, UI strings and error messages remain en-US per `.docs/DEVELOPMENT.md:44`.

## Scope in code

- **[current from 001–005, unchanged]** router with `/auth/*` and unguarded `/app/home`; `auth_token` in `localStorage`; `GET /api/v1/auth/me` with Bearer validation; 401 token cleanup; session version increments on sign-in, confirmation and password reset; all existing pages and endpoints.
- **[target]** `apps/app/src/auth/route-guard/` — a reusable guard/route wrapper that performs the `/auth/me` check, exposes the four guard states and handles redirects.
- **[target]** `apps/app/src/App.tsx` — apply the guard to `/app/*`, apply the authenticated-user redirect to `/auth/sign-in` and `/auth/sign-up`, and leave the other `/auth/*` routes public.
- **[target]** `apps/app/src/auth/route-guard/` states — "Checking your session…" loader, network-failure message with a Retry control, and en-US error text announced accessibly.
- **[target]** `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/QA.md` and `README.md` — document the `/auth/*` vs `/app/*` boundary, the validation seam and the manual QA steps in the same change.
- **[current, unchanged]** `apps/api` endpoints, Drizzle schema, `EmailService`, `.env.example`, `turbo.json`, `docker-compose.yml`, `@repo/*` packages and the hello-world page at `/`.

## Behavior

### Happy path

1. A visitor opens `http://localhost:5173/app/home` with no stored token.
2. The guard sets `checking`, finds no `auth_token`, skips the API call and navigates to `/auth/sign-in` without rendering private content.
3. The visitor signs in; 002 stores the token and navigates to `/app/home`.
4. The guard reads `auth_token`, calls `GET /api/v1/auth/me` with the Bearer header and shows "Checking your session…".
5. On 200 it sets `authenticated` and renders `/app/home`; the same validation happens on every later navigation into `/app/*`.
6. An authenticated user who opens `/auth/sign-in` or `/auth/sign-up` is redirected to `/app/home` without a validation loop.
7. `/auth/confirm-account`, `/auth/forgot-password` and `/auth/reset-password` remain reachable even while a token is stored.

### Edge cases & failure modes

- **Empty / single / very large data:** no lists are involved. A missing or empty `auth_token` is treated as unauthenticated; no API call is made.
- **Stale / missing / untrusted data:** a 401 from `/auth/me` (expired token, stale `ver` after another login or a password reset, bad signature) clears `auth_token` and navigates to `/auth/sign-in`. A malformed stored value is treated like a 401.
- **Duplicate submit / retries / concurrency / idempotency:** repeated navigations may trigger repeated validation calls; each is independent and read-only. Rapid navigation does not render private content until the latest check returns 200. A retry after a network failure repeats the same GET without clearing the token.
- **Recoverable vs operator-only failures:** a 401 is user-recoverable by signing in again. A network failure or 5xx from the API is recoverable via the Retry control and leaves the token untouched. An API that is permanently unavailable is operator-only; the guard never treats it as proof of logout.

### Loading, empty & offline states

- While validating, the guard shows "Checking your session…" instead of the requested page; no private content is rendered during `checking`.
- On network failure it shows "Unable to verify your session." with a "Retry" button; the stored token stays in `localStorage`.
- Offline navigation to `/app/*` therefore stops on the retry state rather than silently redirecting to sign-in.
- No empty-list or skeleton state exists: route protection has no data listing.

## UX & accessibility

- The loading and failure states are announced with `role="status"` and `role="alert"` respectively; the Retry control is keyboard reachable with visible focus.
- Redirects preserve no deep link by explicit decision: the user returns to `/auth/sign-in`, and 002 takes them to `/app/home` after login.
- Authenticated-user redirect from `/auth/sign-in` and `/auth/sign-up` happens before those forms render, so no confusing second-login form is shown.
- Responsive from mobile to desktop, light theme only, CSS variables from `.docs/DESIGN.md`, no dark mode, no shadcn/ui and no third-party scripts.
- Text is en-US throughout; no state is signalled by color alone.

## Technical approach

- **Architecture and layer ownership:** implement the guard in the client under `apps/app/src/auth/route-guard/` and apply it in `App.tsx`; no API or database changes. This preserves the layering and vertical slices established in 001–005.
- **Public seam / interface:** the guard consumes `GET /api/v1/auth/me` with `Authorization: Bearer {token}` and interprets 200/401/network failure. The public routes are `/auth/*`; the private routes are `/app/*`.
- **Data flow, persistence, and source traceability:** the only client state is `auth_token` in `localStorage` plus the guard state; validation is server-side so token replacement and password-reset invalidation are honoured automatically. No product connector or source traceability is involved.
- **External boundaries and adapters (do not assume a connector exists):** the only external call is `GET /api/v1/auth/me`; no Google/Notion/Jira connector or email adapter is touched by this spec.
- **Security, privacy, and observability:** private content never renders before a 200; a 401 clears the token, following 002's localStorage mitigation; the token is never logged. Server-side version validation prevents a stale token from passing a local-only expiry check. The client-only scope is explicit so future private APIs know they must validate the Bearer token themselves.
- **Migration, rollout, flag, and rollback:** no migration, flag or backfill. Rollback reverts the commit; earlier unguarded `/app/*` behavior returns with it. No persisted data is changed.

## Decisions

- **D-1 — Validate through `GET /auth/me` on each `/app/*` navigation:** server-side validation honours version invalidation from sign-in (002), confirmation (003) and reset (005). Rejected: local JWT decode only (accepts stale versions); global API middleware (no private endpoints yet and does not protect the page). ADR: no. Verified by: `specs/002-sign-in.md` D-10 and AC-15.
- **D-2 — Redirect only `/auth/sign-in` and `/auth/sign-up` for authenticated users:** keeps confirmation and recovery links usable for a user who already has a token. Rejected: redirect all `/auth/*` (breaks 003/004/005); allow everything (allows accidental second sessions). ADR: no. Verified by: user decision in interview round 1, `specs/003-confirm-account.md`, `specs/005-reset-password.md`.
- **D-3 — Drop the original destination on 401:** keeps 002's sign-in redirect contract and this spec independent. Rejected: `returnTo` query parameter (would modify 002); error without redirect (unrecoverable). ADR: no. Verified by: user decision in interview round 1, `specs/002-sign-in.md` AC-11.
- **D-4 — Loader plus Retry on network failure, keeping the token:** distinguishes "not logged in" from "API unavailable". Rejected: treating every error as logout (temporary outage logs users out); rendering before validation (private content flashes). ADR: no. Verified by: user decision in interview round 1.
- **D-5 — Client-only guard:** there are no private product endpoints yet, and a global API middleware would need exemptions for all auth endpoints. Rejected: middleware for `/api/v1/*`; placeholder `/app/*` routes on the API. ADR: no. Verified by: `apps/api/src/app.controller.ts`, current endpoint inventory.
- **D-6 — No npm workspaces, endpoints or migrations change in this spec:** the guard is client-only and reuses existing router and validation seams. Rejected: new auth package or API layer. ADR: no. Verified by: `apps/app/package.json` already includes `react-router-dom` from 001.

## Test strategy & seams

- **Guard unit seam (Vitest + React Testing Library, jsdom):** catches no-token redirect, 200 render, 401 token cleanup and redirect, network-failure retry state, and the authenticated-user redirect from the two credential pages. Misses real navigation timing in a browser. Source of truth: AC-1, AC-2, AC-3, AC-4, AC-6, AC-8.
- **Validation seam (mocked `GET /auth/me`):** catches Bearer header construction and interpretation of 200/401/5xx. Misses real JWT verification, which is covered by 002. Source of truth: D-1 and AC-2, AC-3, AC-5.
- **Public-route seam (component render):** catches that confirm-account, forgot-password and reset-password render while a token is stored, and that `/auth/*` works with no token. Source of truth: AC-7, AC-9.
- **Docs seam (manual review):** catches missing public/private documentation and QA steps. Source of truth: AC-10.
- **Browser E2E:** deferred — Playwright is not part of this initiative; manual QA steps in `.docs/QA.md` cover the real browser path.

## Acceptance criteria

- [ ] AC-1 — Given no `auth_token` in `localStorage`, when a browser opens `/app/home`, then the guard redirects to `/auth/sign-in` and no private content is rendered.
- [ ] AC-2 — Given a stored token that `GET /api/v1/auth/me` accepts, when a browser opens `/app/home`, then the guard shows "Checking your session…" while validating and renders `/app/home` only after HTTP 200.
- [ ] AC-3 — Given a stored token that `GET /api/v1/auth/me` rejects with 401, when a private route is opened, then `auth_token` is removed, the browser navigates to `/auth/sign-in` and no private content is rendered.
- [ ] AC-4 — Given a token invalidated by a later sign-in or a password reset, when a private route is opened, then the guard treats the 401 from `/auth/me` as unauthenticated and redirects to `/auth/sign-in`.
- [ ] AC-5 — Given `GET /api/v1/auth/me` is called by the guard, when the request is sent, then it carries `Authorization: Bearer {TOKEN}` from `localStorage` and the token is not written to logs.
- [ ] AC-6 — Given the validation request fails with a network error or 5xx, when the guard handles it, then it shows "Unable to verify your session." with a keyboard-reachable "Retry" button and keeps `auth_token` stored.
- [ ] AC-7 — Given a stored valid token, when a browser opens `/auth/sign-in` or `/auth/sign-up`, then the guard redirects to `/app/home` without rendering those forms.
- [ ] AC-8 — Given a stored valid token, when a browser opens `/auth/confirm-account`, `/auth/forgot-password` or `/auth/reset-password`, then the corresponding page renders and is not redirected.
- [ ] AC-9 — Given no stored token, when a browser opens any `/auth/*` page, then that page renders without a validation call to `/auth/me`.
- [ ] AC-10 — Given the change is committed, when a reviewer reads `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/QA.md` and `README.md`, then the `/auth/*` public and `/app/*` private boundary, the validation seam and the manual QA steps are documented.
- [ ] AC-11 — Given `/app/home` is opened after sign-in, when the guard validates the token, then the hello-world placeholder from earlier specs is unchanged and no API endpoint beyond `/auth/me` was added by this spec.

## Open questions & assumptions

None — every branch was resolved by an explicit user decision in the interview or by inherited facts from 001–005. Future private product APIs are a deliberate follow-up, not an open question in this spec.

## Handoff to implement-me

- **Constraints:** do not modify sign-in redirect logic (002), confirmation/reset pages (003/005), API endpoints, database schema or `EmailService`. Do not add `returnTo`, a global API middleware, shadcn/ui, Playwright or sign-out. Keep `/` and all `/auth/*` behavior from earlier specs intact.
- **Dependencies to add:** none; reuse `react-router-dom` and the `auth_token` key from 001/002 and the existing `GET /api/v1/auth/me`.
- **Temporary behavior:** `/app/home` is still the hello-world placeholder; there are no other private pages yet. Deep links are intentionally dropped on 401. Network failures keep the user on a retry state rather than logging them out.
- **Follow-ups (outside this initiative):** sign-out, session refresh/rotation, OAuth/social login, MFA, email change, confirmation resend and server-side validation for future private product endpoints.
- **Manual QA data:** API on 3000, client on 5173. Run `npm run test`, `npm run lint`, `npm run check-types`, `npm run build` and the documented browser checks. With no token, open `/app/home` and confirm redirect to sign-in; sign in and reopen `/app/home` to see the loader then the page; sign in a second time from another profile and confirm the first profile's next `/app/home` load redirects with the token cleared; stop the API to confirm the Retry state; open `/auth/*` with and without a token to confirm the exception rules.
- **Execution order reminder:** this is the last spec in the approved breakdown; implementation starts with `/implement-me 001-sign-up` and continues through 002, 003, 004, 005 and 006 in order. All six specs currently have no open questions.
