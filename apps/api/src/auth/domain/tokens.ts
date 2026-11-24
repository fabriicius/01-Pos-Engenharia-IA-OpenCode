import { createHash, randomBytes } from "node:crypto";

export const CONFIRMATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
