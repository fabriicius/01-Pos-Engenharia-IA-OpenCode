import {
  BadGatewayException,
  Body,
  Controller,
  GoneException,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { ResetPasswordUseCase } from "../application/reset-password.use-case";
import {
  InvalidPasswordResetTokenError,
  PasswordResetNotificationError,
} from "../domain/errors";
import { ResetPasswordRequestDto } from "./dto/reset-password-request.dto";

@Controller("auth")
export class ResetPasswordController {
  constructor(private readonly resetPasswordUseCase: ResetPasswordUseCase) {}

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordRequestDto,
  ): Promise<{ message: string }> {
    try {
      await this.resetPasswordUseCase.execute(dto);
      return { message: "Your password has been reset." };
    } catch (error) {
      if (error instanceof InvalidPasswordResetTokenError) {
        throw new GoneException(
          "This password reset link is invalid or has expired.",
        );
      }
      if (error instanceof PasswordResetNotificationError) {
        throw new BadGatewayException(
          "Unable to reset your password. Please try again.",
        );
      }
      throw error;
    }
  }
}
