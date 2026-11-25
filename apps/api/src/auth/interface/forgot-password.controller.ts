import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ForgotPasswordUseCase } from "../application/forgot-password.use-case";
import { ForgotPasswordRequestDto } from "./dto/forgot-password-request.dto";

const GENERIC_MESSAGE =
  "If an account exists for that email, a password reset link has been sent.";

@Controller("auth")
export class ForgotPasswordController {
  constructor(private readonly forgotPasswordUseCase: ForgotPasswordUseCase) {}

  @Post("forgot-password")
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body() dto: ForgotPasswordRequestDto,
  ): Promise<{ message: string }> {
    await this.forgotPasswordUseCase.execute(dto);
    return { message: GENERIC_MESSAGE };
  }
}
