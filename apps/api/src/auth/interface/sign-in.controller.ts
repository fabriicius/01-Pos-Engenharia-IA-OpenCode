import {
  BadGatewayException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { CurrentSession } from "../application/get-current-session.use-case";
import { SignInResult, SignInUseCase } from "../application/sign-in.use-case";
import {
  AccountNotConfirmedError,
  InvalidCredentialsError,
  SessionNotificationError,
} from "../domain/errors";
import { SignInRequestDto } from "./dto/sign-in-request.dto";
import { BearerRequest, SessionGuard } from "./session.guard";

@Controller("auth")
export class SignInController {
  constructor(private readonly signInUseCase: SignInUseCase) {}

  @Post("sign-in")
  @HttpCode(HttpStatus.OK)
  async signIn(@Body() dto: SignInRequestDto): Promise<SignInResult> {
    try {
      return await this.signInUseCase.execute(dto);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException(
          "Unable to sign in with the provided credentials.",
        );
      }
      if (error instanceof AccountNotConfirmedError) {
        throw new ForbiddenException(
          "Please confirm your account before signing in.",
        );
      }
      if (error instanceof SessionNotificationError) {
        throw new BadGatewayException("Unable to sign in. Please try again.");
      }
      throw error;
    }
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@Req() request: BearerRequest): Promise<CurrentSession> | CurrentSession {
    const session = request.currentSession;
    if (session === undefined) {
      throw new UnauthorizedException(
        "Unable to authenticate with the provided token.",
      );
    }
    return session;
  }
}
