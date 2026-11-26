import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setAuthToken } from "../api-client";
import { GuestOnlyRoute } from "./GuestOnlyRoute";

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/auth/sign-in"
          element={
            <GuestOnlyRoute>
              <h1>Sign in</h1>
            </GuestOnlyRoute>
          }
        />
        <Route
          path="/auth/sign-up"
          element={
            <GuestOnlyRoute>
              <h1>Create your account</h1>
            </GuestOnlyRoute>
          }
        />
        <Route
          path="/auth/forgot-password"
          element={<h1>Forgot password</h1>}
        />
        <Route path="/app/home" element={<h1>Hello World</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("GuestOnlyRoute", () => {
  it("redirects a stored token away from sign-in and sign-up", () => {
    setAuthToken("jwt-value");
    vi.stubGlobal("fetch", vi.fn());

    renderAt("/auth/sign-in");
    expect(screen.getByRole("heading", { name: "Hello World" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
    cleanup();

    renderAt("/auth/sign-up");
    expect(screen.getByRole("heading", { name: "Hello World" })).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Create your account" }),
    ).toBeNull();
  });

  it("renders the credential form without a token and makes no validation call", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/auth/sign-in");

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves other public auth routes reachable with a stored token", () => {
    setAuthToken("jwt-value");
    vi.stubGlobal("fetch", vi.fn());

    renderAt("/auth/forgot-password");

    expect(
      screen.getByRole("heading", { name: "Forgot password" }),
    ).toBeTruthy();
  });
});
