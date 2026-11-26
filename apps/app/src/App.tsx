import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { GuestOnlyRoute } from "./auth/route-guard/GuestOnlyRoute";
import { RouteGuard } from "./auth/route-guard/RouteGuard";
import { ConfirmAccountPage } from "./auth/confirm-account/ConfirmAccountPage";
import { ForgotPasswordPage } from "./auth/forgot-password/ForgotPasswordPage";
import { ResetPasswordPage } from "./auth/reset-password/ResetPasswordPage";
import { SignInPage } from "./auth/sign-in/SignInPage";
import { SignUpPage } from "./auth/sign-up/SignUpPage";

function AppHomePage() {
  return (
    <main className="hello-world">
      <h1>Hello World</h1>
      <p>This page is a placeholder for protected pages.</p>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auth/sign-in" replace />} />
      <Route
        path="/auth/sign-up"
        element={
          <GuestOnlyRoute>
            <SignUpPage />
          </GuestOnlyRoute>
        }
      />
      <Route
        path="/auth/sign-in"
        element={
          <GuestOnlyRoute>
            <SignInPage />
          </GuestOnlyRoute>
        }
      />
      <Route path="/auth/confirm-account" element={<ConfirmAccountPage />} />
      <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/app"
        element={
          <RouteGuard>
            <Outlet />
          </RouteGuard>
        }
      >
        <Route path="home" element={<AppHomePage />} />
      </Route>
    </Routes>
  );
}
