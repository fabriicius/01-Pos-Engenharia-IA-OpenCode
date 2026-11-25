import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AccessTokenService,
} from "../domain/access-token";
import {
  InvalidConfirmationTokenError,
  SessionNotificationError,
} from "../domain/errors";
import { EmailService } from "../domain/email";
import { UnitOfWork } from "../domain/ports";
import { sessionEmailText } from "../domain/session-email";
import { hashToken } from "../domain/tokens";

export interface ConfirmAccountInput {
  token: string;
}

export interface ConfirmAccountResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

@Injectable()
export class ConfirmAccountUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly accessTokens: AccessTokenService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: ConfirmAccountInput): Promise<ConfirmAccountResult> {
    const now = new Date();
    const tokenHash = hashToken(input.token);

    const confirmed = await this.unitOfWork.run(async (repositories) => {
      const claim = await repositories.confirmationTokens.claimByHash(
        tokenHash,
        now,
      );
      if (claim === null) {
        throw new InvalidConfirmationTokenError();
      }

      const version = await repositories.accounts.activateIfPending(
        claim.userId,
      );
      if (version === null) {
        throw new InvalidConfirmationTokenError();
      }

      const account = await repositories.accounts.findById(claim.userId);
      if (account === null) {
        throw new InvalidConfirmationTokenError();
      }

      return {
        userId: claim.userId,
        email: account.email,
        usedAt: claim.usedAt,
        version,
      };
    });

    const accessToken = this.accessTokens.sign(
      confirmed.userId,
      confirmed.version,
    );

    try {
      await this.emailService.send({
        to: confirmed.email,
        subject: "A new session was created",
        text: sessionEmailText(
          this.config.get<string>("APP_URL") ?? "http://localhost:5173",
          now,
        ),
      });
    } catch {
      await this.unitOfWork.run(async (repositories) => {
        await repositories.confirmationTokens.releaseClaim(
          tokenHash,
          confirmed.usedAt,
        );
        await repositories.accounts.restorePendingSession(
          confirmed.userId,
          confirmed.version,
        );
      });
      throw new SessionNotificationError();
    }

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }
}
