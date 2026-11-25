import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import jwt from "jsonwebtoken";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AccessTokenClaims,
  AccessTokenService,
} from "../domain/access-token";

export { ACCESS_TOKEN_TTL_SECONDS };
export const DEFAULT_JWT_SECRET = "local-development-only-change-me";

@Injectable()
export class JwtAccessTokenService extends AccessTokenService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    super();

    const configured = config.get<string>("JWT_SECRET");
    const isProduction = config.get<string>("NODE_ENV") === "production";

    if (configured === undefined || configured === "") {
      if (isProduction) {
        throw new Error("JWT_SECRET must be set in production.");
      }
      this.secret = DEFAULT_JWT_SECRET;
      return;
    }

    this.secret = configured;
  }

  sign(accountId: string, version: number): string {
    return jwt.sign({ sub: accountId, ver: version }, this.secret, {
      algorithm: "HS256",
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  verify(token: string): AccessTokenClaims | null {
    try {
      const payload = jwt.verify(token, this.secret, {
        algorithms: ["HS256"],
      });

      return isAccessTokenClaims(payload) ? payload : null;
    } catch {
      return null;
    }
  }
}

function isAccessTokenClaims(value: unknown): value is AccessTokenClaims {
  return (
    typeof value === "object" &&
    value !== null &&
    "sub" in value &&
    typeof value.sub === "string" &&
    "ver" in value &&
    typeof value.ver === "number" &&
    "iat" in value &&
    typeof value.iat === "number" &&
    "exp" in value &&
    typeof value.exp === "number"
  );
}
