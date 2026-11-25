import { useState } from "react";
import type { FormEvent } from "react";
import { DEFAULT_API_URL, extractErrorMessage } from "../api-client";

const GENERIC_ERROR = "Unable to create account. Please try again.";

type SubmitStatus = "idle" | "submitting" | "success";

interface SignUpValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

function readValue(formData: FormData, key: keyof SignUpValues): string {
  return String(formData.get(key) ?? "");
}

export function SignUpPage() {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const values: SignUpValues = {
      firstName: readValue(formData, "firstName"),
      lastName: readValue(formData, "lastName"),
      email: readValue(formData, "email"),
      password: readValue(formData, "password"),
      confirmPassword: readValue(formData, "confirmPassword"),
    };

    if (values.password !== values.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setStatus("submitting");

    const apiUrl = (import.meta.env.VITE_API_URL ?? DEFAULT_API_URL).replace(
      /\/$/,
      "",
    );

    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/sign-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
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
    <main className="sign-up-page">
      <h1>Create your account</h1>

      {status === "success" ? (
        <p className="success-message" role="status">
          Check your email to confirm your account.
        </p>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="field">
            <label htmlFor="firstName">First name</label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              maxLength={100}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="lastName">Last name</label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              maxLength={100}
              required
            />
          </div>

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
              autoComplete="new-password"
              minLength={8}
              aria-describedby="password-hint"
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
            {status === "submitting" ? "Creating account…" : "Create account"}
          </button>
        </form>
      )}
    </main>
  );
}
