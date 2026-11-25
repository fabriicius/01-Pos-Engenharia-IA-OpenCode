import { ConfigService } from "@nestjs/config";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  JwtAccessTokenService,
} from "./jwt-access-token.service";

const SECRET = "unit-test-secret";

function createService(): JwtAccessTokenService {
  return new JwtAccessTokenService(new ConfigService({ JWT_SECRET: SECRET }));
}

describe("JwtAccessTokenService", () => {
  it("signs an HS256 token with sub, ver, iat and a 24-hour exp", () => {
    const token = createService().sign("account-uuid", 3);
    const header = jwt.decode(token, { complete: true });

    expect(header?.header.alg).toBe("HS256");

    const claims = createService().verify(token);
    expect(claims?.sub).toBe("account-uuid");
    expect(claims?.ver).toBe(3);
    expect(claims?.exp).toBe((claims?.iat ?? 0) + ACCESS_TOKEN_TTL_SECONDS);
  });

  it("rejects a tampered token", () => {
    const token = createService().sign("account-uuid", 1);

    expect(createService().verify(`${token}tampered`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = jwt.sign(
      { sub: "account-uuid", ver: 1, iat: now - 200000, exp: now - 100000 },
      SECRET,
      { algorithm: "HS256" },
    );

    expect(createService().verify(expired)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const foreign = jwt.sign({ sub: "account-uuid", ver: 1 }, "other-secret", {
      algorithm: "HS256",
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });

    expect(createService().verify(foreign)).toBeNull();
  });
});
