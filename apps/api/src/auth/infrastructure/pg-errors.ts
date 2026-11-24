function postgresCode(error: unknown, depth = 0): unknown {
  if (typeof error !== "object" || error === null || depth > 4) {
    return undefined;
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  if ("cause" in error) {
    return postgresCode(Reflect.get(error, "cause"), depth + 1);
  }

  return undefined;
}

// Drizzle wraps driver errors in DrizzleQueryError, so the SQLSTATE code lives
// on `cause` rather than on the error thrown by the repository call.
export function isUniqueViolation(error: unknown): boolean {
  return postgresCode(error) === "23505";
}
