import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailMessage, EmailService } from "../domain/email";
import {
  AccountRecord,
  AccountRepository,
  ConfirmationTokenInput,
  ConfirmationTokenRepository,
  LatestPasswordResetToken,
  PasswordResetTokenInput,
  PasswordResetTokenRepository,
  PendingAccountInput,
  PersistencePorts,
  TokenClaim,
  UnitOfWork,
} from "../domain/ports";
import { hashToken } from "../domain/tokens";
import { ForgotPasswordUseCase } from "./forgot-password.use-case";

const GENERIC_MESSAGE =
  "If an account exists for that email, a password reset link has been sent.";

interface ResetTokenRow extends PasswordResetTokenInput {
  usedAt: Date | null;
}

class MemoryAccountRepository extends AccountRepository {
  rows: AccountRecord[] = [];

  async create(input: PendingAccountInput): Promise<void> {
    this.rows.push({ ...input, sessionVersion: 0 });
  }

  async remove(id: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.id !== id);
  }

  async findByEmail(email: string): Promise<AccountRecord | null> {
    return this.rows.find((row) => row.email === email.toLowerCase()) ?? null;
  }

  async findByEmailForUpdate(email: string): Promise<AccountRecord | null> {
    return this.findByEmail(email);
  }

  async findById(id: string): Promise<AccountRecord | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async incrementSessionVersion(id: string): Promise<number> {
    const row = this.rows.find((entry) => entry.id === id);
    if (row === undefined) {
      throw new Error("Account not found.");
    }
    row.sessionVersion += 1;
    return row.sessionVersion;
  }

  async setSessionVersionIfVersion(
    id: string,
    expectedVersion: number,
    newVersion: number,
  ): Promise<void> {
    const row = this.rows.find((entry) => entry.id === id);
    if (row !== undefined && row.sessionVersion === expectedVersion) {
      row.sessionVersion = newVersion;
    }
  }

  async activateIfPending(_id: string): Promise<number | null> {
    return 1;
  }

  async restorePendingSession(
    _id: string,
    _issuedVersion: number,
  ): Promise<void> {
    return undefined;
  }

  async setPasswordAndIncrementVersionIfVersion(
    _id: string,
    _passwordHash: string,
    _expectedVersion: number,
    _newVersion: number,
  ): Promise<number | null> {
    return null;
  }

  async restorePasswordAndVersion(
    _id: string,
    _oldPasswordHash: string,
    _issuedVersion: number,
  ): Promise<void> {
    return undefined;
  }
}

class NoopConfirmationTokenRepository extends ConfirmationTokenRepository {
  async create(_input: ConfirmationTokenInput): Promise<void> {
    return undefined;
  }

  async removeByUserId(_userId: string): Promise<void> {
    return undefined;
  }

  async claimByHash(
    _tokenHash: string,
    _now: Date,
  ): Promise<TokenClaim | null> {
    return null;
  }

  async releaseClaim(_tokenHash: string, _claimedUsedAt: Date): Promise<void> {
    return undefined;
  }
}

class MemoryPasswordResetTokenRepository extends PasswordResetTokenRepository {
  rows: ResetTokenRow[] = [];

  async create(input: PasswordResetTokenInput): Promise<void> {
    this.rows.push({ ...input, usedAt: null });
  }

  async findNewestUnconsumedByUserId(
    userId: string,
  ): Promise<LatestPasswordResetToken | null> {
    const rows = this.rows
      .filter((row) => row.userId === userId && row.usedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return rows[0] === undefined ? null : { createdAt: rows[0].createdAt };
  }

  async invalidateUnconsumedByUserId(userId: string, now: Date): Promise<void> {
    for (const row of this.rows) {
      if (row.userId === userId && row.usedAt === null) {
        row.usedAt = now;
      }
    }
  }

  async removeById(id: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.id !== id);
  }

  async claimByHash(
    _tokenHash: string,
    _now: Date,
  ): Promise<TokenClaim | null> {
    return null;
  }

  async releaseClaim(_tokenHash: string, _claimedUsedAt: Date): Promise<void> {
    return undefined;
  }
}

class MemoryUnitOfWork extends UnitOfWork {
  readonly accounts = new MemoryAccountRepository();
  readonly passwordResetTokens = new MemoryPasswordResetTokenRepository();
  readonly repositories: PersistencePorts = {
    accounts: this.accounts,
    confirmationTokens: new NoopConfirmationTokenRepository(),
    passwordResetTokens: this.passwordResetTokens,
  };
  private queue: Promise<void> = Promise.resolve();

  async run<T>(
    work: (repositories: PersistencePorts) => Promise<T>,
  ): Promise<T> {
    const previous = this.queue;
    let release = (): void => undefined;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const accountRows = this.accounts.rows.map((row) => ({ ...row }));
    const tokenRows = this.passwordResetTokens.rows.map((row) => ({ ...row }));
    try {
      return await work(this.repositories);
    } catch (error) {
      this.accounts.rows = accountRows;
      this.passwordResetTokens.rows = tokenRows;
      throw error;
    } finally {
      release();
    }
  }
}

class CapturingEmailService extends EmailService {
  readonly messages: EmailMessage[] = [];
  readonly attempted: EmailMessage[] = [];
  shouldFail = false;

  async send(message: EmailMessage): Promise<void> {
    this.attempted.push(message);
    if (this.shouldFail) {
      throw new Error("SMTP down");
    }
    this.messages.push(message);
  }
}

function createUseCase(): {
  useCase: ForgotPasswordUseCase;
  unitOfWork: MemoryUnitOfWork;
  email: CapturingEmailService;
} {
  const unitOfWork = new MemoryUnitOfWork();
  const email = new CapturingEmailService();
  const config = new ConfigService({ APP_URL: "http://localhost:5173/" });

  return {
    useCase: new ForgotPasswordUseCase(unitOfWork, email, config),
    unitOfWork,
    email,
  };
}

function seedAccount(
  unitOfWork: MemoryUnitOfWork,
  status: "pending" | "active" = "active",
): string {
  const id = randomUUID();
  unitOfWork.accounts.rows.push({
    id,
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    passwordHash: "hashed-password",
    status,
    sessionVersion: 0,
  });
  return id;
}

function seedToken(
  unitOfWork: MemoryUnitOfWork,
  userId: string,
  createdAt: Date,
): void {
  unitOfWork.passwordResetTokens.rows.push({
    id: randomUUID(),
    userId,
    tokenHash: hashToken("old-token"),
    expiresAt: new Date(createdAt.getTime() + 60 * 60 * 1000),
    usedAt: null,
    createdAt,
  });
}

function rawTokenFrom(email: EmailMessage): string {
  const match = /auth\/reset-password\?token=([^\s]+)/.exec(email.text);
  if (match === null) {
    throw new Error("Reset link missing from email.");
  }
  return match[1]!;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ForgotPasswordUseCase", () => {
  it("issues one hashed one-hour token and emails the reset link for an active account", async () => {
    const { useCase, unitOfWork, email } = createUseCase();
    const userId = seedAccount(unitOfWork);
    const before = new Date();

    await useCase.execute({ email: "ADA@Example.com" });

    const row = unitOfWork.passwordResetTokens.rows[0];
    expect(unitOfWork.accounts.rows[0]?.status).toBe("active");
    expect(unitOfWork.passwordResetTokens.rows).toHaveLength(1);
    expect(row?.userId).toBe(userId);
    expect(row?.usedAt).toBeNull();
    expect(row?.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime() + 60 * 60 * 1000,
    );
    expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 60 * 60 * 1000,
    );
    expect(email.messages).toHaveLength(1);
    expect(email.messages[0]?.to).toBe("ada@example.com");
    expect(email.messages[0]?.subject).toBe("Reset your password");
    expect(email.messages[0]?.text).toContain(
      "http://localhost:5173/auth/reset-password?token=",
    );
    expect(email.messages[0]?.text).toContain("expires in one hour");
    expect(email.messages[0]?.text).toContain(
      "If you didn't request this, you can ignore this email.",
    );
    const rawToken = rawTokenFrom(email.messages[0]!);
    expect(row?.tokenHash).toBe(hashToken(rawToken));
    expect(JSON.stringify(unitOfWork.passwordResetTokens.rows)).not.toContain(
      rawToken,
    );
  });

  it("issues nothing for an unknown email or a pending account", async () => {
    const unknown = createUseCase();
    await unknown.useCase.execute({ email: "nobody@example.com" });
    expect(unknown.unitOfWork.passwordResetTokens.rows).toHaveLength(0);
    expect(unknown.email.messages).toHaveLength(0);

    const pending = createUseCase();
    seedAccount(pending.unitOfWork, "pending");
    await pending.useCase.execute({ email: "ada@example.com" });
    expect(pending.unitOfWork.passwordResetTokens.rows).toHaveLength(0);
    expect(pending.email.messages).toHaveLength(0);
  });

  it("silently suppresses a request inside the 60-second cooldown", async () => {
    const { useCase, unitOfWork, email } = createUseCase();
    const userId = seedAccount(unitOfWork);
    const createdAt = new Date(Date.now() - 59_000);
    seedToken(unitOfWork, userId, createdAt);

    await useCase.execute({ email: "ada@example.com" });

    expect(unitOfWork.passwordResetTokens.rows).toHaveLength(1);
    expect(unitOfWork.passwordResetTokens.rows[0]).toMatchObject({
      createdAt,
      usedAt: null,
    });
    expect(email.messages).toHaveLength(0);
  });

  it("invalidates the old token and sends a new link after the cooldown", async () => {
    const { useCase, unitOfWork, email } = createUseCase();
    const userId = seedAccount(unitOfWork);
    const oldCreatedAt = new Date(Date.now() - 61_000);
    seedToken(unitOfWork, userId, oldCreatedAt);

    await useCase.execute({ email: "ada@example.com" });

    expect(unitOfWork.passwordResetTokens.rows).toHaveLength(2);
    expect(unitOfWork.passwordResetTokens.rows[0]?.usedAt).toBeInstanceOf(Date);
    expect(unitOfWork.passwordResetTokens.rows[1]).toMatchObject({
      userId,
      usedAt: null,
    });
    expect(unitOfWork.passwordResetTokens.rows[1]?.tokenHash).toBe(
      hashToken(rawTokenFrom(email.messages[0]!)),
    );
    expect(email.messages).toHaveLength(1);
  });

  it("logs a failed dispatch, removes the token and resolves without disclosing the failure", async () => {
    const { useCase, unitOfWork, email } = createUseCase();
    seedAccount(unitOfWork);
    email.shouldFail = true;
    const log = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);

    await expect(
      useCase.execute({ email: "ada@example.com" }),
    ).resolves.toBeUndefined();

    expect(unitOfWork.passwordResetTokens.rows).toHaveLength(0);
    expect(email.attempted).toHaveLength(1);
    expect(log).toHaveBeenCalledTimes(1);
    const rawToken = rawTokenFrom(email.attempted[0]!);
    expect(JSON.stringify(log.mock.calls)).not.toContain(rawToken);
    expect(JSON.stringify(log.mock.calls)).not.toContain(GENERIC_MESSAGE);
  });

  it("lets only one of two concurrent requests issue a token and email", async () => {
    const { useCase, unitOfWork, email } = createUseCase();
    seedAccount(unitOfWork);

    await Promise.all([
      useCase.execute({ email: "ada@example.com" }),
      useCase.execute({ email: "ada@example.com" }),
    ]);

    expect(unitOfWork.passwordResetTokens.rows).toHaveLength(1);
    expect(email.messages).toHaveLength(1);
  });
});
