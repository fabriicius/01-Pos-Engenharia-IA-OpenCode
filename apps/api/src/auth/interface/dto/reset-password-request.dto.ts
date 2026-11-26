import { IsNotEmpty, IsString, MinLength, Validate } from "class-validator";
import { ResetPasswordInput } from "../../application/reset-password.use-case";
import { PasswordsMatchConstraint } from "./passwords-match.constraint";
import { MIN_PASSWORD_LENGTH } from "./sign-up-request.dto";

export class ResetPasswordRequestDto implements ResetPasswordInput {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  password!: string;

  @IsString()
  @Validate(PasswordsMatchConstraint)
  confirmPassword!: string;
}
