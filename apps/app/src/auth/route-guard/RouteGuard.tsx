import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { apiFetch, hasAuthToken } from "../api-client";

type GuardState =
  "checking" | "authenticated" | "unauthenticated" | "unavailable";

export function RouteGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GuardState>(() =>
    hasAuthToken() ? "checking" : "unauthenticated",
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hasAuthToken()) {
      return;
    }

    let cancelled = false;

    async function validate(): Promise<void> {
      try {
        const response = await apiFetch("/api/v1/auth/me");
        if (cancelled) {
          return;
        }
        if (response.status === 200) {
          setState("authenticated");
        } else if (response.status === 401) {
          // apiFetch clears the stored token on any 401, including a token
          // whose session version was replaced by a later sign-in or reset.
          setState("unauthenticated");
        } else {
          setState("unavailable");
        }
      } catch {
        if (!cancelled) {
          setState("unavailable");
        }
      }
    }

    void validate();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state === "unauthenticated") {
    return <Navigate to="/auth/sign-in" replace />;
  }

  if (state === "checking") {
    return (
      <main className="route-guard-status" role="status">
        Checking your session…
      </main>
    );
  }

  if (state === "unavailable") {
    return (
      <main className="route-guard-status" role="alert">
        <p>Unable to verify your session.</p>
        <button
          type="button"
          onClick={() => {
            setState("checking");
            setAttempt((value) => value + 1);
          }}
        >
          Retry
        </button>
      </main>
    );
  }

  return <>{children}</>;
}
