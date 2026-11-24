import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { EmailService, EmailMessage } from "../domain/email";
import {
  AccountRepository,
  ConfirmationTokenInput,
  ConfirmationTokenRepository,
  PasswordHasher,
  PendingAccountInput,
  PersistencePorts,
  UnitOfWork,
} from "../domain/ports";
import { SignUpRequestDto } from "../interface/dto/sign-up-request.dto";
import { SignUpUseCase } from "./sign-up.use-case";

const INPUT: SignUpRequestDto = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ADA@Example.COM",
  password: "a-long-enough-password",
  confirmPassword: "a-long-enough-password",
};

class FakeAccountRepository implements AccountRepository {
  rows: PendingAccountInput[] = [];

  async create(input: PendingAccountInput): Promise<void> {
    this.rows.push(input);
  }

  async remove(id: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.id !== id);
  }
}

class FakeConfirmationTokenRepository implements ConfirmationTokenRepository {
  rows: ConfirmationTokenInput[] = [];

  async create(input: ConfirmationTokenInput): Promise<void> {
    this.rows.push(input);
  }

  async removeByUserId(userId: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.userId !== userId);
  }
}

class FakeUnitOfWork extends UnitOfWork {
  readonly accounts = new FakeAccountRepository();
  readonly confirmationTokens = new FakeConfirmationTokenRepository();
  readonly repositories: PersistencePorts = {
    accounts: this.accounts,
    confirmationTokens: this.confirmationTokens,
  };

  async run<T>(
    work: (repositories: PersistencePorts) => Promise<T>,
  ): Promise<T> {
    return work(this.repositories);
  }
}

class FakePasswordHasher extends PasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return `hashed:${plainPassword}`;
  }
}

class CapturingEmailService extends EmailService {
  messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }
}

function createUseCase(appUrl = "http://localhost:5173"): {
  useCase: SignUpUseCase;
  unitOfWork: FakeUnitOfWork;
  emailService: CapturingEmailService;
} {
  const unitOfWork = new FakeUnitOfWork();
  const emailService = new CapturingEmailService();
  const config = new ConfigService({ APP_URL: appUrl });

  return {
    useCase: new SignUpUseCase(
      unitOfWork,
      new FakePasswordHasher(),
      emailService,
      config,
    ),
    unitOfWork,
    emailService,
  };
}

describe("SignUpUseCase", () => {
  it("persists a pending account with a lowercased email and a bcrypt-style hash", async () => {
    const { useCase, unitOfWork } = createUseCase();

    await useCase.execute(INPUT);

    expect(unitOfWork.accounts.rows).toHaveLength(1);
    const account = unitOfWork.accounts.rows[0];
    expect(account?.email).toBe("ada@example.com");
    expect(account?.firstName).toBe("Ada");
    expect(account?.lastName).toBe("Lovelace");
    expect(account?.passwordHash).not.toBe(INPUT.password);
    expect(account?.passwordHash).toBe(`hashed:${INPUT.password}`);
    expect(account?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("stores only the hash of the token sent in the email link", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T12:00:00.000Z"));

    try {
      const { useCase, unitOfWork, emailService } = createUseCase();

      await useCase.execute(INPUT);

      const link = emailService.messages[0]?.text.match(
        /\/auth\/confirm-account\?token=([^\s]+)/,
      );
      const rawToken = link?.[1];
      expect(rawToken).toBeTruthy();
      expect(rawToken).not.toContain("hashed:");

      const tokenRow = unitOfWork.confirmationTokens.rows[0];
      expect(tokenRow?.tokenHash).toBe(
        createHash("sha256")
          .update(rawToken ?? "")
          .digest("hex"),
      );
      expect(tokenRow?.tokenHash).not.toBe(rawToken);
      expect(tokenRow?.userId).toBe(unitOfWork.accounts.rows[0]?.id);
      expect(tokenRow?.expiresAt.getTime()).toBe(
        (tokenRow?.createdAt.getTime() ?? 0) + 24 * 60 * 60 * 1000,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends an en-US message to the submitted address using APP_URL", async () => {
    const { useCase, emailService } = createUseCase("https://app.example.com/");

    await useCase.execute(INPUT);

    const message = emailService.messages[0];
    expect(message?.to).toBe("ada@example.com");
    expect(message?.subject).toBe("Confirm your account");
    expect(message?.text).toContain(
      "https://app.example.com/auth/confirm-account?token=",
    );
    expect(message?.text).toContain("Welcome!");
    expect(message?.text).toContain("This link expires in 24 hours.");
  });

  it("removes the account and token when the email adapter fails", async () => {
    const { unitOfWork } = createUseCase();
    const failingEmail = new CapturingEmailService();
    vi.spyOn(failingEmail, "send").mockRejectedValue(new Error("SMTP down"));
    const failingUseCase = new SignUpUseCase(
      unitOfWork,
      new FakePasswordHasher(),
      failingEmail,
      new ConfigService({ APP_URL: "http://localhost:5173" }),
    );

    await expect(failingUseCase.execute(INPUT)).rejects.toThrow(
      "Confirmation email could not be delivered.",
    );
    expect(unitOfWork.accounts.rows).toHaveLength(0);
    expect(unitOfWork.confirmationTokens.rows).toHaveLength(0);
  });

  it("does not persist the raw token anywhere in the captured inputs", async () => {
    const { useCase, unitOfWork, emailService } = createUseCase();

    await useCase.execute(INPUT);

    const rawToken =
      emailService.messages[0]?.text.match(/token=([^\s]+)/)?.[1];
    const persisted = JSON.stringify({
      account: unitOfWork.accounts.rows,
      token: unitOfWork.confirmationTokens.rows,
    });

    expect(rawToken).toBeTruthy();
    expect(persisted).not.toContain(rawToken ?? "unreachable-token");
  });
});
