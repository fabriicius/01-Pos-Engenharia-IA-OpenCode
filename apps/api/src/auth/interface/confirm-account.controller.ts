import {
  BadGatewayException,
  Body,
  Controller,
  GoneException,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import {
  ConfirmAccountResult,
  ConfirmAccountUseCase,
} from "../application/confirm-account.use-case";
import {
  InvalidConfirmationTokenError,
  SessionNotificationError,
} from "../domain/errors";
import { ConfirmAccountRequestDto } from "./dto/confirm-account-request.dto";

@Controller("auth")
export class ConfirmAccountController {
  constructor(private readonly confirmAccountUseCase: ConfirmAccountUseCase) {}

  @Post("confirm-account")
  @HttpCode(HttpStatus.OK)
  async confirmAccount(
    @Body() dto: ConfirmAccountRequestDto,
  ): Promise<ConfirmAccountResult> {
    try {
      return await this.confirmAccountUseCase.execute(dto);
    } catch (error) {
      if (error instanceof InvalidConfirmationTokenError) {
        throw new GoneException(
          "This confirmation link is invalid or has expired.",
        );
      }
      if (error instanceof SessionNotificationError) {
        throw new BadGatewayException(
          "Unable to confirm your account. Please try again.",
        );
      }
      throw error;
    }
  }
}
