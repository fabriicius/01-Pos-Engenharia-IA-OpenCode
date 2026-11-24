import {
  BadGatewayException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { SignUpUseCase } from "../application/sign-up.use-case";
import { DuplicateEmailError, EmailDispatchError } from "../domain/errors";
import { SignUpRequestDto } from "./dto/sign-up-request.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly signUpUseCase: SignUpUseCase) {}

  @Post("sign-up")
  @HttpCode(HttpStatus.CREATED)
  async signUp(@Body() dto: SignUpRequestDto): Promise<{ message: string }> {
    try {
      await this.signUpUseCase.execute(dto);
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        throw new ConflictException(
          "Unable to create account with this email address.",
        );
      }
      if (error instanceof EmailDispatchError) {
        throw new BadGatewayException(
          "Unable to create account. Please try again.",
        );
      }
      throw error;
    }

    return {
      message: "Account created. Check your email to confirm your account.",
    };
  }
}
