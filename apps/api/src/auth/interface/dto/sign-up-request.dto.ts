import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  Validate,
} from "class-validator";
import { SignUpInput } from "../../application/sign-up.use-case";
import { PasswordsMatchConstraint } from "./passwords-match.constraint";

export const MIN_PASSWORD_LENGTH = 8;

export class SignUpRequestDto implements SignUpInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  password!: string;

  @IsString()
  @Validate(PasswordsMatchConstraint)
  confirmPassword!: string;
}
