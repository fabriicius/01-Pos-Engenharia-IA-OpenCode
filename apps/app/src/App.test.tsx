import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import indexHtml from "../index.html?raw";
import { App } from "./App";

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("application routes", () => {
  it("redirects / to the sign-in page", () => {
    renderAt("/");

    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("renders the public sign-up page at /auth/sign-up", () => {
    renderAt("/auth/sign-up");

    expect(
      screen.getByRole("heading", { level: 1, name: "Create your account" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Confirm password")).toBeTruthy();
  });

  it("renders the public sign-in page at /auth/sign-in", () => {
    renderAt("/auth/sign-in");

    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("renders the public confirmation page at /auth/confirm-account", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    renderAt("/auth/confirm-account?token=valid-token");

    expect(
      screen.getByRole("heading", { level: 1, name: "Confirm account" }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(
      "Confirming your account…",
    );
  });

  it("renders the public forgot-password page at /auth/forgot-password", () => {
    renderAt("/auth/forgot-password");

    expect(
      screen.getByRole("heading", { level: 1, name: "Forgot password" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Send reset link" }),
    ).toBeTruthy();
  });

  it("renders the public reset-password page at /auth/reset-password", () => {
    renderAt("/auth/reset-password?token=valid-token");

    expect(
      screen.getByRole("heading", { level: 1, name: "Reset password" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset password" })).toBeTruthy();
  });

  it("redirects /app/home to sign-in when no token is stored", () => {
    renderAt("/app/home");

    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Hello World" })).toBeNull();
  });

  it("redirects a stored token from sign-in to the guarded home page", async () => {
    localStorage.setItem("auth_token", "jwt-value");
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 } as Response);
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/auth/sign-in");

    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
    expect(
      await screen.findByRole("heading", { name: "Hello World" }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("declares the document title in index.html", () => {
    expect(indexHtml).toContain("<title>Hello World</title>");
  });
});
