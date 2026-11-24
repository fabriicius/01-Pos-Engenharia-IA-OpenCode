import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONSOLE_FALLBACK_WARNING,
  ConsoleEmailAdapter,
} from "./console.adapter";

describe("ConsoleEmailAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the full message and a fallback warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await new ConsoleEmailAdapter().send({
      to: "ada@example.com",
      subject: "Confirm your account",
      text: "Confirm: http://localhost:5173/auth/confirm-account?token=abc",
    });

    expect(warn).toHaveBeenCalledWith(CONSOLE_FALLBACK_WARNING);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain("Confirm your account");
    expect(log.mock.calls[0]?.[0]).toContain("ada@example.com");
    expect(log.mock.calls[0]?.[0]).toContain(
      "http://localhost:5173/auth/confirm-account?token=abc",
    );
  });
});
