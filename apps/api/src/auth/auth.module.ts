import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SignUpUseCase } from "./application/sign-up.use-case";
import { EmailService } from "./domain/email";
import { PasswordHasher, UnitOfWork } from "./domain/ports";
import { BcryptPasswordHasher } from "./infrastructure/bcrypt-password-hasher";
import { DatabaseClient } from "./infrastructure/database";
import { createEmailService } from "./infrastructure/email/email-service.factory";
import { DrizzleUnitOfWork } from "./infrastructure/unit-of-work";
import { AuthController } from "./interface/auth.controller";

@Module({
  controllers: [AuthController],
  providers: [
    SignUpUseCase,
    DatabaseClient,
    { provide: UnitOfWork, useClass: DrizzleUnitOfWork },
    { provide: PasswordHasher, useClass: BcryptPasswordHasher },
    {
      provide: EmailService,
      useFactory: createEmailService,
      inject: [ConfigService],
    },
  ],
})
export class AuthModule {}
