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
import { ResetPasswordPage } from "./ResetPasswordPage";

const API_URL = "http://localhost:3000/api/v1/auth/reset-password";
const TOKEN = "raw-reset-token";
const PASSWORD = "a-brand-new-password";
const INVALID_LINK = "This password reset link is invalid or has expired.";
const GENERIC_ERROR = "Unable to reset your password. Please try again.";

function renderPage(path = `/auth/reset-password?token=${TOKEN}`): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/sign-in" element={<h1>Sign in</h1>} />
        <Route
          path="/auth/forgot-password"
          element={<h1>Forgot password</h1>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function fillForm(password = PASSWORD, confirmPassword = PASSWORD): void {
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: confirmPassword },
  });
}

function submit(): void {
  fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("ResetPasswordPage", () => {
  it("renders labelled fields with a minimum-8 hint in keyboard order", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Reset password" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("New password").getAttribute("type")).toBe(
      "password",
    );
    expect(
      screen.getByLabelText("New password").getAttribute("autocomplete"),
    ).toBe("new-password");
    expect(screen.getByText("Use at least 8 characters.")).toBeTruthy();
    expect(screen.getByLabelText("Confirm password")).toBeTruthy();
    expect(
      Array.from(document.querySelectorAll("input")).map((input) => input.name),
    ).toEqual(["password", "confirmPassword"]);
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("shows the generic invalid-link view without a request when token is missing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderPage("/auth/reset-password");

    expect(screen.getByRole("alert").textContent).toBe(INVALID_LINK);
    expect(
      screen
        .getByRole("link", { name: "Request a new link" })
        .getAttribute("href"),
    ).toBe("/auth/forgot-password");
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects short and mismatched passwords locally without a request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    fillForm("short", "short");
    submit();
    expect(screen.getByRole("alert").textContent).toBe(
      "Use at least 8 characters.",
    );
    expect(fetchMock).not.toHaveBeenCalled();

    fillForm(PASSWORD, "another-long-password");
    submit();
    expect(screen.getByRole("alert").textContent).toBe(
      "Passwords do not match.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText("New password") as HTMLInputElement).value,
    ).toBe(PASSWORD);
  });

  it("posts the body token, shows a submitting state, clears auth_token and navigates", async () => {
    let finishRequest: (value: unknown) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem(AUTH_TOKEN_KEY, "stale-token");
    renderPage();

    fillForm();
    submit();

    const submitting = screen.getByRole("button", {
      name: "Resetting password…",
    });
    expect(submitting.hasAttribute("disabled")).toBe(true);

    finishRequest({ status: 200, ok: true });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Sign in" }),
      ).toBeTruthy();
    });
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      API_URL,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          token: TOKEN,
          password: PASSWORD,
          confirmPassword: PASSWORD,
        }),
      }),
    );
  });

  it("shows a single generic invalid-link message on 410", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 410,
        ok: false,
        json: async () => ({ message: INVALID_LINK }),
      }),
    );
    renderPage();

    fillForm();
    submit();

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(INVALID_LINK);
    });
    expect(
      screen
        .getByRole("link", { name: "Request a new link" })
        .getAttribute("href"),
    ).toBe("/auth/forgot-password");
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset password" })).toBeNull();
  });

  it("keeps a server validation error visible and does not navigate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ message: ["password is too short"] }),
      }),
    );
    renderPage();

    fillForm();
    submit();

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "password is too short",
      );
    });
    expect(screen.getByRole("button", { name: "Reset password" })).toBeTruthy();
    expect(
      (screen.getByLabelText("New password") as HTMLInputElement).value,
    ).toBe(PASSWORD);
  });

  it("shows the generic error on 502 and when the network is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 502,
        ok: false,
        json: async () => ({ message: GENERIC_ERROR }),
      }),
    );
    renderPage();
    fillForm();
    submit();
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(GENERIC_ERROR);
    });
    cleanup();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderPage();
    fillForm();
    submit();
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(GENERIC_ERROR);
    });
    expect(screen.getByRole("button", { name: "Reset password" })).toBeTruthy();
  });
});
