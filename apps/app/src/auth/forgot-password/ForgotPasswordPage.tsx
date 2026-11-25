import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiFetch, extractErrorMessage } from "../api-client";

const GENERIC_SUCCESS =
  "If an account exists for that email, a password reset link has been sent.";
const GENERIC_ERROR = "Unable to send the link. Please try again.";

type SubmitStatus = "idle" | "submitting" | "success";

export function ForgotPasswordPage() {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");

    setError(null);
    setStatus("submitting");

    try {
      const response = await apiFetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setError(extractErrorMessage(body) ?? GENERIC_ERROR);
        setStatus("idle");
        return;
      }

      setStatus("success");
    } catch {
      setError(GENERIC_ERROR);
      setStatus("idle");
    }
  }

  return (
    <main className="forgot-password-page">
      <h1>Forgot password</h1>

      {status === "success" ? (
        <>
          <p className="success-message" role="status">
            {GENERIC_SUCCESS}
          </p>
          <p>
            <Link to="/auth/sign-in">Back to sign in</Link>
          </p>
        </>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
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
            {status === "submitting" ? "Sending link…" : "Send reset link"}
          </button>
        </form>
      )}
    </main>
  );
}
