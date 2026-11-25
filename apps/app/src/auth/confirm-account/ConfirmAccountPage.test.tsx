import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_KEY } from "../api-client";
import { ConfirmAccountPage } from "./ConfirmAccountPage";

const API_URL = "http://localhost:3000/api/v1/auth/confirm-account";
const VALID_URL = "/auth/confirm-account?token=valid-token";
const INVALID_LINK = "This confirmation link is invalid or has expired.";

function response(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

function successResponse(): Response {
  return response(200, {
    accessToken: "jwt-value",
    tokenType: "Bearer",
    expiresIn: 86400,
  });
}

function renderPage(path = VALID_URL, strict = false): void {
  const page = <ConfirmAccountPage />;
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/auth/confirm-account"
          element={strict ? <StrictMode>{page}</StrictMode> : page}
        />
        <Route path="/app/home" element={<h1>Private home</h1>} />
        <Route path="/auth/sign-up" element={<h1>Create your account</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("ConfirmAccountPage", () => {
  it("shows the loading state, posts the query token once and navigates home", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    expect(screen.getByRole("status").textContent).toBe(
      "Confirming your account…",
    );
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Private home" }),
      ).toBeTruthy();
    });
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("jwt-value");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      API_URL,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "valid-token" }),
      }),
    );
  });

  it("posts once under StrictMode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    renderPage(VALID_URL, true);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Private home" }),
      ).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the generic 410 error with a sign-up link and stores no token", async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, "existing-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(410, { message: INVALID_LINK }));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(INVALID_LINK);
    });
    expect(
      screen.getByRole("link", { name: "Create an account" }),
    ).toBeTruthy();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("existing-token");
  });

  it("shows a retry action for other failures and retries the POST", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(500, { message: "Server error" }))
      .mockResolvedValueOnce(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Unable to confirm your account. Please try again.",
      );
    });
    screen.getByRole("button", { name: "Try again" }).click();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Private home" }),
      ).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not POST when the query has no token", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderPage("/auth/confirm-account");

    expect(screen.getByRole("alert").textContent).toBe(INVALID_LINK);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
