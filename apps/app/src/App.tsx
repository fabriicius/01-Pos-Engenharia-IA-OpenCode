import { Route, Routes } from "react-router-dom";
import { ConfirmAccountPage } from "./auth/confirm-account/ConfirmAccountPage";
import { SignInPage } from "./auth/sign-in/SignInPage";
import { SignUpPage } from "./auth/sign-up/SignUpPage";

function HelloWorldPage() {
  return (
    <main className="hello-world">
      <h1>Hello World</h1>
    </main>
  );
}

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
      <Route path="/" element={<HelloWorldPage />} />
      <Route path="/auth/sign-up" element={<SignUpPage />} />
      <Route path="/auth/sign-in" element={<SignInPage />} />
      <Route path="/auth/confirm-account" element={<ConfirmAccountPage />} />
      <Route path="/app/home" element={<AppHomePage />} />
    </Routes>
  );
}
