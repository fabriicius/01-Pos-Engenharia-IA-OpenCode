import { SignInResult } from "../../application/sign-in.use-case";

export class SignInResponseDto implements SignInResult {
  accessToken!: string;
  tokenType!: "Bearer";
  expiresIn!: number;
}
