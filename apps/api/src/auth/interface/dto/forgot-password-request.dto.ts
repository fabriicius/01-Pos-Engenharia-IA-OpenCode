import { IsEmail, IsString } from "class-validator";
import { ForgotPasswordInput } from "../../application/forgot-password.use-case";

export class ForgotPasswordRequestDto implements ForgotPasswordInput {
  @IsString()
  @IsEmail()
  email!: string;
}
