export const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60;

export interface AccessTokenClaims {
  sub: string;
  ver: number;
  iat: number;
  exp: number;
}

export abstract class AccessTokenService {
  abstract sign(accountId: string, version: number): string;
  abstract verify(token: string): AccessTokenClaims | null;
}
