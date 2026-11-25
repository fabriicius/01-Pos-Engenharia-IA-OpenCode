import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch, setAuthToken } from "../api-client";

const INVALID_LINK_MESSAGE =
  "This confirmation link is invalid or has expired.";
const GENERIC_ERROR = "Unable to confirm your account. Please try again.";

type ConfirmStatus = "loading" | "invalid" | "error";

function readAccessToken(body: unknown): string | null {
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

export function ConfirmAccountPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const [status, setStatus] = useState<ConfirmStatus>(
    token === null ? "invalid" : "loading",
  );
  const started = useRef(false);

  const confirmAccount = useCallback(async (): Promise<void> => {
    if (token === null) {
      setStatus("invalid");
      return;
    }

    setStatus("loading");
    try {
      const response = await apiFetch("/api/v1/auth/confirm-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (response.status === 410) {
        setStatus("invalid");
        return;
      }
      if (!response.ok) {
        setStatus("error");
        return;
      }

      const accessToken = readAccessToken(
        await response.json().catch(() => null),
      );
      if (accessToken === null) {
        setStatus("error");
        return;
      }

      setAuthToken(accessToken);
      navigate("/app/home");
    } catch {
      setStatus("error");
    }
  }, [token, navigate]);

  useEffect(() => {
    if (token === null || started.current) {
      return;
    }
    started.current = true;
    void confirmAccount();
  }, [token, confirmAccount]);

  return (
    <main className="confirm-account-page">
      <h1>Confirm account</h1>

      {status === "loading" && <p role="status">Confirming your account…</p>}

      {status === "invalid" && (
        <>
          <p className="field-error" role="alert">
            {INVALID_LINK_MESSAGE}
          </p>
          <p>
            <Link to="/auth/sign-up">Create an account</Link>
          </p>
        </>
      )}

      {status === "error" && (
        <>
          <p className="field-error" role="alert">
            {GENERIC_ERROR}
          </p>
          <button type="button" onClick={() => void confirmAccount()}>
            Try again
          </button>
        </>
      )}
    </main>
  );
}
