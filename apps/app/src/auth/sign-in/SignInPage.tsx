import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, extractErrorMessage, setAuthToken } from "../api-client";

const GENERIC_ERROR = "Unable to sign in. Please try again.";

type SubmitStatus = "idle" | "submitting";

function readToken(body: unknown): string | null {
  if (
    typeof body === "object" &&
    body !== null &&
    "accessToken" in body &&
    typeof body.accessToken === "string"
  ) {
    return body.accessToken;
  }
  return null;
}

export function SignInPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    setError(null);
    setStatus("submitting");

    try {
      const response = await apiFetch("/api/v1/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setError(extractErrorMessage(body) ?? GENERIC_ERROR);
        setStatus("idle");
        return;
      }

      const token = readToken(await response.json().catch(() => null));
      if (token === null) {
        setError(GENERIC_ERROR);
        setStatus("idle");
        return;
      }

      setAuthToken(token);
      navigate("/app/home");
    } catch {
      setError(GENERIC_ERROR);
      setStatus("idle");
    }
  }

  return (
    <main className="sign-in-page">
      <h1>Sign in</h1>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
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
          {status === "submitting" ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
