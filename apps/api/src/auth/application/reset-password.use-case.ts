import { Injectable } from "@nestjs/common";
import {
  InvalidPasswordResetTokenError,
  PasswordResetNotificationError,
} from "../domain/errors";
import { EmailService } from "../domain/email";
import { PasswordHasher, UnitOfWork } from "../domain/ports";
import { resetConfirmationEmailText } from "../domain/reset-confirmation-email";
import { hashToken } from "../domain/tokens";

export interface ResetPasswordInput {
  token: string;
  password: string;
  confirmPassword: string;
}

interface ChangedPassword {
  userId: string;
  email: string;
  oldPasswordHash: string;
  newVersion: number;
  usedAt: Date;
}

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly passwordHasher: PasswordHasher,
    private readonly emailService: EmailService,
  ) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    const now = new Date();
    const tokenHash = hashToken(input.token);
    const newPasswordHash = await this.passwordHasher.hash(input.password);

    const changed = await this.unitOfWork.run(async (repositories) => {
      const claim = await repositories.passwordResetTokens.claimByHash(
        tokenHash,
        now,
      );
      if (claim === null) {
        throw new InvalidPasswordResetTokenError();
      }

      const account = await repositories.accounts.findById(claim.userId);
      if (account === null || account.status !== "active") {
        throw new InvalidPasswordResetTokenError();
      }

      const newVersion =
        await repositories.accounts.setPasswordAndIncrementVersionIfVersion(
          claim.userId,
          newPasswordHash,
          account.sessionVersion,
          account.sessionVersion + 1,
        );
      if (newVersion === null) {
        throw new InvalidPasswordResetTokenError();
      }

      return {
        userId: claim.userId,
        email: account.email,
        oldPasswordHash: account.passwordHash,
        newVersion,
        usedAt: claim.usedAt,
      } satisfies ChangedPassword;
    });

    try {
      await this.emailService.send({
        to: changed.email,
        subject: "Your password has been reset",
        text: resetConfirmationEmailText(now),
      });
    } catch {
      await this.unitOfWork.run(async (repositories) => {
        await repositories.passwordResetTokens.releaseClaim(
          tokenHash,
          changed.usedAt,
        );
        await repositories.accounts.restorePasswordAndVersion(
          changed.userId,
          changed.oldPasswordHash,
          changed.newVersion,
        );
      });
      throw new PasswordResetNotificationError();
    }
  }
}
