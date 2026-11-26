import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_TOKEN_KEY,
  apiFetch,
  clearAuthToken,
  extractErrorMessage,
  getAuthToken,
  hasAuthToken,
  setAuthToken,
} from "./api-client";

const API_URL = "http://localhost:3000/api/v1/auth/me";

function response(status: number): Response {
  return { status } as Response;
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("sends the stored token as a Bearer header", async () => {
    setAuthToken("jwt-value");
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/v1/auth/me");

    expect(fetchMock).toHaveBeenCalledWith(
      API_URL,
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer jwt-value");
  });

  it("does not add an Authorization header without a stored token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/v1/auth/me");

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.has("Authorization")).toBe(false);
  });

  it("clears the stored token on any 401 response", async () => {
    setAuthToken("stale-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(401)));

    await apiFetch("/api/v1/auth/me");

    expect(getAuthToken()).toBeNull();
  });

  it("keeps the stored token on non-401 responses", async () => {
    setAuthToken("current-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(500)));

    await apiFetch("/api/v1/auth/me");

    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("current-token");
  });

  it("clears the stored token explicitly", () => {
    setAuthToken("token");
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });
});

describe("hasAuthToken", () => {
  it("is false when no token is stored", () => {
    expect(hasAuthToken()).toBe(false);
  });

  it("is false when the stored token is empty", () => {
    localStorage.setItem(AUTH_TOKEN_KEY, "");
    expect(hasAuthToken()).toBe(false);
  });

  it("is true when a token is stored", () => {
    setAuthToken("jwt-value");
    expect(hasAuthToken()).toBe(true);
  });
});

describe("extractErrorMessage", () => {
  it("reads a string message", () => {
    expect(extractErrorMessage({ message: "Nope." })).toBe("Nope.");
  });

  it("joins validation message arrays", () => {
    expect(
      extractErrorMessage({ message: ["Bad email.", "Bad password."] }),
    ).toBe("Bad email. Bad password.");
  });

  it("ignores unrelated values", () => {
    expect(extractErrorMessage(null)).toBeNull();
    expect(extractErrorMessage({ other: "value" })).toBeNull();
  });
});
