import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_KEY } from "../api-client";
import { SignInPage } from "./SignInPage";

const API_URL = "http://localhost:3000/api/v1/auth/sign-in";
const CREDENTIALS = { email: "ada@example.com", password: "a-password" };

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={["/auth/sign-in"]}>
      <Routes>
        <Route path="/auth/sign-in" element={<SignInPage />} />
        <Route path="/app/home" element={<h1>Private home</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillForm(): void {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: CREDENTIALS.email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: CREDENTIALS.password },
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("SignInPage", () => {
  it("renders labelled email and password fields in keyboard order", () => {
    renderPage();

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();

    const names = Array.from(document.querySelectorAll("input")).map((input) =>
      input.getAttribute("name"),
    );
    expect(names).toEqual(["email", "password"]);
  });

  it("stores the token and navigates to /app/home on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        accessToken: "jwt-value",
        tokenType: "Bearer",
        expiresIn: 86400,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Private home" }),
      ).toBeTruthy();
    });
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("jwt-value");
    expect(fetchMock).toHaveBeenCalledWith(
      API_URL,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows a submitting state while the request is in flight", async () => {
    let finishRequest: (value: unknown) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            finishRequest = resolve;
          }),
      ),
    );
    renderPage();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const submitting = screen.getByRole("button", { name: "Signing in…" });
    expect(submitting.hasAttribute("disabled")).toBe(true);

    finishRequest({
      status: 200,
      ok: true,
      json: async () => ({ accessToken: "jwt-value" }),
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Private home" }),
      ).toBeTruthy();
    });
  });

  it("shows the API message and clears a stored token on 401", async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, "stale-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
        json: async () => ({
          message: "Unable to sign in with the provided credentials.",
        }),
      }),
    );
    renderPage();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Unable to sign in with the provided credentials.",
      );
    });
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  it("shows the confirmation guidance for a pending account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 403,
        ok: false,
        json: async () => ({
          message: "Please confirm your account before signing in.",
        }),
      }),
    );
    renderPage();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Please confirm your account before signing in.",
      );
    });
  });

  it("shows a generic error when the network is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderPage();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Unable to sign in. Please try again.",
      );
    });
  });
});
