import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { EmailService } from "../domain/email";
import { passwordResetEmailText } from "../domain/password-reset-email";
import { PasswordResetTokenInput, UnitOfWork } from "../domain/ports";
import {
  generateOpaqueToken,
  hashToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
  RESET_COOLDOWN_MS,
} from "../domain/tokens";

export interface ForgotPasswordInput {
  email: string;
}

interface IssuedResetToken {
  id: string;
  rawToken: string;
  to: string;
}

@Injectable()
export class ForgotPasswordUseCase {
  private readonly logger = new Logger(ForgotPasswordUseCase.name);

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: ForgotPasswordInput): Promise<void> {
    const now = new Date();
    const email = input.email.toLowerCase();

    const issued = await this.unitOfWork.run(async (repositories) => {
      const account = await repositories.accounts.findByEmailForUpdate(email);
      if (account === null || account.status !== "active") {
        return null;
      }

      const latest =
        await repositories.passwordResetTokens.findNewestUnconsumedByUserId(
          account.id,
        );
      if (
        latest !== null &&
        now.getTime() - latest.createdAt.getTime() < RESET_COOLDOWN_MS
      ) {
        return null;
      }
      if (latest !== null) {
        await repositories.passwordResetTokens.invalidateUnconsumedByUserId(
          account.id,
          now,
        );
      }

      const rawToken = generateOpaqueToken();
      const token: PasswordResetTokenInput = {
        id: randomUUID(),
        userId: account.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS),
        createdAt: now,
      };
      await repositories.passwordResetTokens.create(token);

      return {
        id: token.id,
        rawToken,
        to: account.email,
      } satisfies IssuedResetToken;
    });

    if (issued === null) {
      return;
    }

    try {
      await this.emailService.send({
        to: issued.to,
        subject: "Reset your password",
        text: passwordResetEmailText(
          this.config.get<string>("APP_URL") ?? "http://localhost:5173",
          issued.rawToken,
        ),
      });
    } catch (error) {
      await this.unitOfWork.run(async (repositories) => {
        await repositories.passwordResetTokens.removeById(issued.id);
      });
      this.logger.error(
        `Password reset email dispatch failed for token ${issued.id}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
