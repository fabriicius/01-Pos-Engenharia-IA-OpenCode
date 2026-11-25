# ADR 0003 — JWT version sessions and localStorage token storage

- **Status:** accepted
- **Date:** 2026-11-25
- **Spec:** `specs/002-sign-in.md`
- **Decisions recorded:** D-1, D-2, D-3, D-4

## Context

`002-sign-in` must make "one valid session per person — the last login wins" observable without adding a second store, and must give `006-route-protection` a server-side validation seam. The user explicitly chose token-version invalidation over a database session table plus httpOnly cookie, and explicitly chose to return the token in the response body and keep it in browser `localStorage`. That choice exposes the token to XSS, so concrete mitigations had to be accepted in the same decision rather than left implicit.

## Decision

### D-1/D-2 — Session = HS256 JWT plus `users.session_version`

- A session is not a row: it is a signed JWT with `sub` (account UUID), `ver`, `iat` and `exp = iat + 86400`, signed with `JWT_SECRET`.
- `users.session_version integer not null default 0` is added by `drizzle/0002_sign_in.sql`.
- Every successful sign-in runs `UPDATE users SET session_version = session_version + 1 WHERE id = ... RETURNING session_version` in one transaction. The JWT `ver` comes from the value returned by that update, never from a separate read, so concurrent logins cannot issue two tokens with the same version (AC-10).
- `GET /api/v1/auth/me` verifies the signature/expiry with `jsonwebtoken`, then compares `ver` with the current database value. A mismatch is indistinguishable from a bad signature: 401 with no account data.
- `JWT_SECRET` has a development-only default in `.env.example`. With `NODE_ENV=production` and no secret, `JwtAccessTokenService` throws at construction (operator-only startup error); the API never signs an unsigned token.
- Rejected: a database `auth_sessions` table with httpOnly cookies, an in-memory map, 1-hour tokens, and a hand-rolled HMAC.

### D-3/D-4 — Body token, `localStorage`, Bearer header and four mitigations

- `POST /api/v1/auth/sign-in` returns `{ accessToken, tokenType: "Bearer", expiresIn: 86400 }` and no password, secret or internal error detail.
- The client stores `accessToken` under `localStorage` key `auth_token`, sends it as `Authorization: Bearer {token}` through the shared `apiFetch` helper, and navigates to `/app/home` on success.
- Accepted XSS exposure is mitigated by: (1) no third-party scripts in the client, (2) tokens never written to logs, (3) 24-hour expiry, and (4) removal of `auth_token` on **any** 401 response. Cross-tab storage sync and sign-out are deliberately deferred, not silently assumed.
- Rejected: httpOnly cookie (explicitly rejected by the user), server-side 302 redirect, no mitigation, and adding a third-party script later without revisiting this ADR.

### Implementation adjustments (not separate architectural decisions)

- `AccessTokenService` is a domain port; `JwtAccessTokenService` is its `jsonwebtoken` adapter. `GetCurrentSessionUseCase` and `SessionGuard` live in the existing auth slice, so no separate `sessions` module was added (D-5).
- A failed "A new session was created" email is compensated with `setSessionVersionIfVersion(id, issuedVersion, issuedVersion - 1)`: the restore only applies while the row still holds the version this login issued, so it cannot clobber a concurrent login (AC-09/AC-10).
- `SessionNotificationError` is mapped to 502 with the generic message "Unable to sign in. Please try again."; `InvalidCredentialsError` and `AccountNotConfirmedError` map to 401/403 respectively.
- CORS now allows `Content-Type` and `Authorization` for `http://localhost:5173`; credentialed CORS is unnecessary because the token travels in the header.
- `extractErrorMessage` moved to the client's shared `auth/api-client.ts` so sign-up and sign-in read validation/error messages identically.

## Consequences

- Positive: the last-login-wins rule is enforced by one atomic counter and one comparison; 006 can reuse `/auth/me` without a second store.
- Positive: email failure cannot leave an unnotified session, and compensation is safe under concurrency.
- Positive: the localStorage tradeoff is explicit, with four mitigations documented for reviewers.
- Negative: an access token remains valid for up to 24 hours and is readable by any script running in the app's origin; adding third-party scripts would invalidate the stated mitigations and requires revisiting this ADR.
- Negative: a code rollback cannot restore previously incremented version values; tokens issued under the removed column simply stop validating.
- Follow-up: `003-confirm-account` creates its first session through the same increment-and-sign rule; `006-route-protection` guards `/app/*` using `/auth/me`.

## Verification

- `npm run test` → API HTTP contracts for 200/400/401/403/502 and `/auth/me`, JWT unit claims/tampering/expiry, sign-in use-case compensation/concurrency, and client render/localStorage seams pass.
- `npm run lint`, `npm run check-types`, `npm run build`, `npx prettier --check "**/*.{ts,tsx,md}"` pass.
- `npm run db:migrate` twice after `npm run infra:up` → `0002_sign_in` is idempotent; `users.session_version` defaults to 0.
- Manual QA: two sign-ins from separate browser profiles, `/auth/me` accepts only the second token, both notification emails are visible in the console fallback, and a failed adapter returns 502 with the version restored.
