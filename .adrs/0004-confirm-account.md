# ADR 0004 — Confirmation token transport and generic invalid-link response

- **Status:** accepted
- **Date:** 2026-11-25
- **Spec:** `specs/003-confirm-account.md`
- **Decisions recorded:** D-1, D-2 (plus the no-resend scope decision and implementation adjustments below)

## Context

`001-sign-up` already emails a 24-hour opaque confirmation link, and `002-sign-in` already defines the session that a confirmed account must receive. Nothing consumed the confirmation token, so accounts stayed `pending` forever. `003-confirm-account` must turn the emailed link into an activated account and a first session without introducing a second token model, without exposing token state to callers, and without expanding the approved initiative with a resend flow.

The raw token arrives in a browser URL that humans click, but a URL is also copied into API logs, browser history and `Referer` headers. The invalid-link outcome must not tell a caller whether a token was unknown, expired, already used, or belonged to an already-active account.

## Decision

### D-1 — Query token on the public page, POST body token to the API

- The public client route stays `{APP_URL}/auth/confirm-account?token={TOKEN}` so the email link remains clickable and prefetch-safe. Rendering the page performs no state change.
- `ConfirmAccountPage` reads `token` from `useSearchParams()` and sends `POST /api/v1/auth/confirm-account` with `{ "token": "..." }`. A `useRef` guard makes the automatic POST run once under React StrictMode; a missing query token produces the invalid-link message and no request.
- The API hashes the token with the existing `hashToken()` (SHA-256 hex) and never logs or stores the raw value. A conditional `UPDATE ... SET used_at = now() WHERE token_hash = ... AND used_at IS NULL AND expires_at > now() RETURNING user_id` claims the row; status activation and `session_version` increment run in the same `UnitOfWork.run` transaction, so a replay or already-active account rolls the claim back.
- Rejected: an API `GET` that consumes the token, a server redirect carrying the token in a URL, and an extra "Confirm account" button on the page.

### D-2 — One generic 410 and no self-service resend

- Unknown, expired, used and already-active-account tokens all throw `InvalidConfirmationTokenError` and are mapped by the controller to HTTP 410 with exactly "This confirmation link is invalid or has expired."
- The message deliberately promises no resend action: no resend endpoint exists in this initiative, and adding one would change the approved scope. A dead-end link sends the user to `/auth/sign-up`, where the duplicate-email response from 001 remains generic 409.
- Rejected: distinct 400/404 causes per invalid case (state disclosure) and adding a resend endpoint inside 003 (scope change).

### Implementation adjustments (not separate architectural decisions)

- The session output is inherited from 002 byte-for-byte: the JWT is HS256 with `ver` from the incremented row, the response is `{ accessToken, tokenType: "Bearer", expiresIn: 86400 }`, and the same "A new session was created" text is now produced by a shared `sessionEmailText()` helper used by both sign-in and confirmation.
- A failed `EmailService.send` is compensated with a conditional transaction that releases only the claimed `used_at`, restores `status` to `pending` only while it is `active` at the issued version, and restores the version only from the issued value. The endpoint then returns 502 with "Unable to confirm your account. Please try again." and no token.
- `ConfirmationTokenRepository.claimByHash`/`releaseClaim` and `AccountRepository.activateIfPending`/`restorePendingSession` are new narrow ports; no new table, column or migration is introduced.
- The opt-in `RUN_DB_PROBE=1` Vitest spec verifies the conditional SQL against local Postgres when infrastructure is available; it is skipped by default so unit tests do not depend on a running database.

## Consequences

- Positive: a prefetching email scanner cannot confirm an account, because only a POST consumes the token.
- Positive: one atomic claim makes replay and concurrent clicks deterministic — one success, one 410, one session email.
- Positive: invalid links reveal nothing about account state, and no resend promise is made.
- Negative: an expired or lost link is a dead end in this initiative; the user must sign up again and receive a duplicate-email 409, or an operator must intervene.
- Negative: a code rollback cannot undo confirmations already performed by the released version or restore consumed token rows.

## Verification

- `npm run test` covers the 200/400/410/502 HTTP contract, the use-case state transitions and compensation, and the client render/seam tests.
- `RUN_DB_PROBE=1 npm run test -w api` exercises the conditional claim/release and activation/restore against local Postgres when Docker/Supabase are running.
- `npm run lint`, `npm run check-types`, `npm run build` and `npx prettier --check "**/*.{ts,tsx,md}"` are the repository quality gates from `.docs/QA.md`.
- Manual QA: sign up, open the emailed link once, check `/app/home`, the session email and the database state; reopen the link for the 410; force an email failure to observe the 502 rollback.
