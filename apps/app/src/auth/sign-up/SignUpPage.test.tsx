import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignUpPage } from "./SignUpPage";

const API_URL = "http://localhost:3000/api/v1/auth/sign-up";

const VALID_VALUES = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  password: "a-long-enough-password",
  confirmPassword: "a-long-enough-password",
};

function fillForm(values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(labelFor(name)), {
      target: { value },
    });
  }
}

function labelFor(name: string): string {
  return {
    firstName: "First name",
    lastName: "Last name",
    email: "Email",
    password: "Password",
    confirmPassword: "Confirm password",
  }[name] as string;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SignUpPage", () => {
  it("shows five labelled inputs in keyboard order with a minimum-length hint", () => {
    render(<SignUpPage />);

    expect(screen.getByLabelText("First name")).toBeTruthy();
    expect(screen.getByLabelText("Last name")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm password")).toBeTruthy();
    expect(screen.getByText("Use at least 8 characters.")).toBeTruthy();

    const names = Array.from(document.querySelectorAll("input")).map((input) =>
      input.getAttribute("name"),
    );
    expect(names).toEqual([
      "firstName",
      "lastName",
      "email",
      "password",
      "confirmPassword",
    ]);
  });

  it("blocks the request when the passwords do not match", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SignUpPage />);

    fillForm({ ...VALID_VALUES, confirmPassword: "different-password" });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "Passwords do not match.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a submitting state and then a success message on the same page", async () => {
    let finishRequest: (value: unknown) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<SignUpPage />);

    fillForm(VALID_VALUES);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    const submittingButton = screen.getByRole("button", {
      name: "Creating account…",
    });
    expect(submittingButton.hasAttribute("disabled")).toBe(true);

    finishRequest({ ok: true, json: async () => ({}) });

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(
        "Check your email to confirm your account.",
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      API_URL,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows a generic error when the network is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<SignUpPage />);

    fillForm(VALID_VALUES);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Unable to create account. Please try again.",
      );
    });
  });

  it("shows the API error message for a rejected request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          message: "Unable to create account with this email address.",
        }),
      }),
    );
    render(<SignUpPage />);

    fillForm(VALID_VALUES);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Unable to create account with this email address.",
      );
    });
  });
});
