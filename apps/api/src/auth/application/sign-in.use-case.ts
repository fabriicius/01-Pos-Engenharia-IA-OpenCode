import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AccessTokenService,
} from "../domain/access-token";
import {
  AccountNotConfirmedError,
  InvalidCredentialsError,
  SessionNotificationError,
} from "../domain/errors";
import { EmailService } from "../domain/email";
import { PasswordHasher, UnitOfWork } from "../domain/ports";

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignInResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

@Injectable()
export class SignInUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokens: AccessTokenService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: SignInInput): Promise<SignInResult> {
    const email = input.email.toLowerCase();
    const now = new Date();

    const account = await this.unitOfWork.run((repositories) =>
      repositories.accounts.findByEmail(email),
    );

    if (
      account === null ||
      !(await this.passwordHasher.compare(input.password, account.passwordHash))
    ) {
      throw new InvalidCredentialsError();
    }

    if (account.status === "pending") {
      throw new AccountNotConfirmedError();
    }

    const version = await this.unitOfWork.run((repositories) =>
      repositories.accounts.incrementSessionVersion(account.id),
    );
    const accessToken = this.accessTokens.sign(account.id, version);

    try {
      await this.emailService.send({
        to: account.email,
        subject: "A new session was created",
        text: this.sessionEmailText(now),
      });
    } catch {
      await this.unitOfWork.run((repositories) =>
        repositories.accounts.setSessionVersionIfVersion(
          account.id,
          version,
          version - 1,
        ),
      );
      throw new SessionNotificationError();
    }

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private sessionEmailText(now: Date): string {
    const appUrl =
      this.config.get<string>("APP_URL") ?? "http://localhost:5173";

    return [
      "Hello,",
      "",
      `A new session was created for your account at ${now.toISOString()} (UTC).`,
      `You can review your account at ${appUrl.replace(/\/$/, "")}/app/home.`,
      "",
      "If this wasn't you, change your password.",
    ].join("\n");
  }
}
