import { Module } from "@nestjs/common";
import { ObservabilityService } from "../observability/observability.service";
import { ObservedEmailService } from "../observability/observed-email";
import { ConsoleEmailAdapter } from "./infrastructure/email/console.adapter";
import { selectEmailProvider } from "./infrastructure/email/email-service.factory";
import { ConfigService } from "@nestjs/config";
import { ConfirmAccountUseCase } from "./application/confirm-account.use-case";
import { ForgotPasswordUseCase } from "./application/forgot-password.use-case";
import { GetCurrentSessionUseCase } from "./application/get-current-session.use-case";
import { ResetPasswordUseCase } from "./application/reset-password.use-case";
import { SignInUseCase } from "./application/sign-in.use-case";
import { SignUpUseCase } from "./application/sign-up.use-case";
import { AccessTokenService } from "./domain/access-token";
import { EmailService } from "./domain/email";
import { PasswordHasher, UnitOfWork } from "./domain/ports";
import { BcryptPasswordHasher } from "./infrastructure/bcrypt-password-hasher";
import { DatabaseClient } from "./infrastructure/database";
import { createEmailService } from "./infrastructure/email/email-service.factory";
import { JwtAccessTokenService } from "./infrastructure/jwt-access-token.service";
import { DrizzleUnitOfWork } from "./infrastructure/unit-of-work";
import { AuthController } from "./interface/auth.controller";
import { ConfirmAccountController } from "./interface/confirm-account.controller";
import { ForgotPasswordController } from "./interface/forgot-password.controller";
import { ResetPasswordController } from "./interface/reset-password.controller";
import { SessionGuard } from "./interface/session.guard";
import { SignInController } from "./interface/sign-in.controller";

@Module({
  controllers: [
    AuthController,
    SignInController,
    ConfirmAccountController,
    ForgotPasswordController,
    ResetPasswordController,
  ],
  providers: [
    SignUpUseCase,
    SignInUseCase,
    ConfirmAccountUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    GetCurrentSessionUseCase,
    SessionGuard,
    DatabaseClient,
    { provide: UnitOfWork, useClass: DrizzleUnitOfWork },
    { provide: PasswordHasher, useClass: BcryptPasswordHasher },
    { provide: AccessTokenService, useClass: JwtAccessTokenService },
    {
      provide: EmailService,
      useFactory: (config: ConfigService, telemetry: ObservabilityService) => {
        const adapter = createEmailService(config);
        return new ObservedEmailService(
          adapter,
          adapter instanceof ConsoleEmailAdapter
            ? "console"
            : selectEmailProvider(config),
          telemetry,
        );
      },
      inject: [ConfigService, ObservabilityService],
    },
  ],
})
export class AuthModule {}
