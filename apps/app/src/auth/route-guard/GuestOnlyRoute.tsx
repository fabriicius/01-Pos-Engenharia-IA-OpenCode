import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { hasAuthToken } from "../api-client";

export function GuestOnlyRoute({ children }: { children: ReactNode }) {
  if (hasAuthToken()) {
    return <Navigate to="/app/home" replace />;
  }

  return <>{children}</>;
}
