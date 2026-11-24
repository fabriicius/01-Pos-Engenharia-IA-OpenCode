import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./pg-errors";

describe("isUniqueViolation", () => {
  it("recognizes a raw Postgres SQLSTATE 23505 error", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("recognizes a DrizzleQueryError wrapping a Postgres error", () => {
    const error = {
      message: "Failed query: insert into users",
      cause: { code: "23505", message: "duplicate key value" },
    };

    expect(isUniqueViolation(error)).toBe(true);
  });

  it("rejects other SQLSTATE codes and unrelated values", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation({ cause: { code: "23503" } })).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
