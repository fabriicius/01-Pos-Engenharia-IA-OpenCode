import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordPage } from "./ForgotPasswordPage";

const API_URL = "http://localhost:3000/api/v1/auth/forgot-password";
const SUCCESS =
  "If an account exists for that email, a password reset link has been sent.";

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={["/auth/forgot-password"]}>
      <Routes>
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/sign-in" element={<h1>Sign in</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillEmail(email = "ada@example.com"): void {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ForgotPasswordPage", () => {
  it("renders one labelled email field with keyboard-reachable controls", () => {
    renderPage();

    const email = screen.getByLabelText("Email");
    expect(email.getAttribute("type")).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(
      screen.getByRole("button", { name: "Send reset link" }),
    ).toBeTruthy();
    expect(
      Array.from(document.querySelectorAll("input")).map((input) =>
        input.getAttribute("name"),
      ),
    ).toEqual(["email"]);
  });

  it("shows a submitting state, then the generic message and sign-in link", async () => {
    let finishRequest: (value: unknown) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    fillEmail();
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    const submitting = screen.getByRole("button", { name: "Sending link…" });
    expect(submitting.hasAttribute("disabled")).toBe(true);

    finishRequest({
      status: 202,
      ok: true,
      json: async () => ({ message: SUCCESS }),
    });

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(SUCCESS);
    });
    expect(
      screen
        .getByRole("link", { name: "Back to sign in" })
        .getAttribute("href"),
    ).toBe("/auth/sign-in");
    expect(fetchMock).toHaveBeenCalledWith(
      API_URL,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "ada@example.com" }),
      }),
    );
  });

  it("shows the same success message for an unknown address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 202,
        ok: true,
        json: async () => ({ message: SUCCESS }),
      }),
    );
    renderPage();

    fillEmail("nobody@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(SUCCESS);
    });
    cleanup();
    renderPage();
    fillEmail("ada@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(SUCCESS);
    });
  });

  it("shows validation errors with role=alert and keeps them after failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ message: ["email must be an email"] }),
      }),
    );
    renderPage();

    fillEmail("bad-email");
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "email must be an email",
      );
    });
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
      "bad-email",
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the generic en-US error when the network is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderPage();

    fillEmail();
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Unable to send the link. Please try again.",
      );
    });
  });
});
