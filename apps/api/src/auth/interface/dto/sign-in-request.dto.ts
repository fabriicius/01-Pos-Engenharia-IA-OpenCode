import { IsEmail, IsNotEmpty, IsString } from "class-validator";
import { SignInInput } from "../../application/sign-in.use-case";

export class SignInRequestDto implements SignInInput {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
