import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setAuthToken } from "../api-client";
import { RouteGuard } from "./RouteGuard";

function renderGuard(): void {
  render(
    <MemoryRouter initialEntries={["/app/home"]}>
      <Routes>
        <Route
          path="/app"
          element={
            <RouteGuard>
              <Outlet />
            </RouteGuard>
          }
        >
          <Route path="home" element={<h1>Hello World</h1>} />
        </Route>
        <Route path="/auth/sign-in" element={<h1>Sign in</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("RouteGuard", () => {
  it("shows a checking state and renders private content only after a 200", async () => {
    setAuthToken("jwt-value");
    let resolveResponse: (value: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);

    renderGuard();

    expect(screen.getByRole("status").textContent).toBe(
      "Checking your session…",
    );
    expect(screen.queryByRole("heading", { name: "Hello World" })).toBeNull();

    resolveResponse({ status: 200 } as Response);

    expect(
      await screen.findByRole("heading", { name: "Hello World" }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/me"),
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer jwt-value");
  });

  it("clears the token and redirects on a 401 without rendering private content", async () => {
    setAuthToken("stale-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 401 } as Response),
    );

    renderGuard();

    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeTruthy();
    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Hello World" })).toBeNull();
  });

  it("treats a token invalidated by a later sign-in or password reset as unauthenticated", async () => {
    setAuthToken("invalidated-by-version-bump");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 401 } as Response),
    );

    renderGuard();

    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeTruthy();
    expect(localStorage.getItem("auth_token")).toBeNull();
  });

  it("shows a retry state and keeps the token when the API is unreachable", async () => {
    setAuthToken("jwt-value");
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    renderGuard();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Unable to verify your session.",
    );
    expect(localStorage.getItem("auth_token")).toBe("jwt-value");
    expect(screen.queryByRole("heading", { name: "Hello World" })).toBeNull();

    fetchMock.mockResolvedValue({ status: 200 } as Response);
    screen.getByRole("button", { name: "Retry" }).click();

    expect(
      await screen.findByRole("heading", { name: "Hello World" }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows the retry state on a 5xx without clearing the token", async () => {
    setAuthToken("jwt-value");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 500 } as Response),
    );

    renderGuard();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Unable to verify your session.",
    );
    expect(localStorage.getItem("auth_token")).toBe("jwt-value");
  });
});
