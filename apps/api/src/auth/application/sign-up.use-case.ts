import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { EmailDispatchError } from "../domain/errors";
import { EmailService } from "../domain/email";
import {
  ConfirmationTokenInput,
  PasswordHasher,
  PendingAccountInput,
  UnitOfWork,
} from "../domain/ports";
import {
  CONFIRMATION_TOKEN_TTL_MS,
  generateOpaqueToken,
  hashToken,
} from "../domain/tokens";

export interface SignUpInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export const DEFAULT_APP_URL = "http://localhost:5173";

@Injectable()
export class SignUpUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly passwordHasher: PasswordHasher,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: SignUpInput): Promise<void> {
    const now = new Date();
    const accountId = randomUUID();
    const email = input.email.toLowerCase();
    const rawToken = generateOpaqueToken();

    const account: PendingAccountInput = {
      id: accountId,
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      passwordHash: await this.passwordHasher.hash(input.password),
      status: "pending",
      createdAt: now,
    };

    const token: ConfirmationTokenInput = {
      id: randomUUID(),
      userId: accountId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(now.getTime() + CONFIRMATION_TOKEN_TTL_MS),
      usedAt: null,
      createdAt: now,
    };

    await this.unitOfWork.run(async (repositories) => {
      await repositories.accounts.create(account);
      await repositories.confirmationTokens.create(token);
    });

    try {
      await this.emailService.send({
        to: email,
        subject: "Confirm your account",
        text: this.confirmationEmailText(rawToken),
      });
    } catch {
      await this.unitOfWork.run(async (repositories) => {
        await repositories.confirmationTokens.removeByUserId(accountId);
        await repositories.accounts.remove(accountId);
      });
      throw new EmailDispatchError();
    }
  }

  private confirmationEmailText(rawToken: string): string {
    const appUrl = this.config.get<string>("APP_URL") ?? DEFAULT_APP_URL;
    const link = `${appUrl.replace(/\/$/, "")}/auth/confirm-account?token=${rawToken}`;

    return [
      "Hello,",
      "",
      "Welcome! Please confirm your account by opening the link below.",
      "",
      link,
      "",
      "This link expires in 24 hours.",
      "",
      "If you did not create this account, you can ignore this message.",
    ].join("\n");
  }
}
