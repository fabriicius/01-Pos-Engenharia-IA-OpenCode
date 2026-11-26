import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch, clearAuthToken, extractErrorMessage } from "../api-client";

const MIN_PASSWORD_LENGTH = 8;
const INVALID_LINK_MESSAGE =
  "This password reset link is invalid or has expired.";
const GENERIC_ERROR = "Unable to reset your password. Please try again.";
const MISMATCH_ERROR = "Passwords do not match.";
const SHORT_PASSWORD_ERROR = "Use at least 8 characters.";

type SubmitStatus = "idle" | "submitting";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(token === null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (token === null) {
      setLinkInvalid(true);
      return;
    }

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(SHORT_PASSWORD_ERROR);
      return;
    }
    if (password !== confirmPassword) {
      setError(MISMATCH_ERROR);
      return;
    }

    setError(null);
    setStatus("submitting");

    try {
      const response = await apiFetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      if (response.status === 410) {
        setLinkInvalid(true);
        setStatus("idle");
        return;
      }
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setError(extractErrorMessage(body) ?? GENERIC_ERROR);
        setStatus("idle");
        return;
      }

      clearAuthToken();
      navigate("/auth/sign-in");
    } catch {
      setError(GENERIC_ERROR);
      setStatus("idle");
    }
  }

  return (
    <main className="reset-password-page">
      <h1>Reset password</h1>

      {linkInvalid ? (
        <>
          <p className="field-error" role="alert">
            {INVALID_LINK_MESSAGE}
          </p>
          <p>
            <Link to="/auth/forgot-password">Request a new link</Link>
          </p>
          <p>
            <Link to="/auth/sign-in">Back to sign in</Link>
          </p>
        </>
      ) : (
        <>
          <form onSubmit={(event) => void handleSubmit(event)}>
            <div className="field">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                aria-describedby={
                  error === null ? "password-hint" : "password-hint form-error"
                }
                required
              />
              <p id="password-hint" className="hint">
                Use at least 8 characters.
              </p>
            </div>

            <div className="field">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-describedby={error === null ? undefined : "form-error"}
                required
              />
            </div>

            {error !== null && (
              <p id="form-error" className="field-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={status === "submitting"}>
              {status === "submitting"
                ? "Resetting password…"
                : "Reset password"}
            </button>
          </form>
          <p>
            <Link to="/auth/sign-in">Back to sign in</Link>
          </p>
        </>
      )}
    </main>
  );
}
