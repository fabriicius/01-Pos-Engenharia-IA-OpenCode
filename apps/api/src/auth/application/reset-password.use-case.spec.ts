import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  InvalidPasswordResetTokenError,
  PasswordResetNotificationError,
} from "../domain/errors";
import { EmailMessage, EmailService } from "../domain/email";
import {
  AccountRecord,
  AccountRepository,
  ConfirmationTokenInput,
  ConfirmationTokenRepository,
  PasswordHasher,
  PasswordResetTokenInput,
  PasswordResetTokenRepository,
  PendingAccountInput,
  PersistencePorts,
  TokenClaim,
  UnitOfWork,
} from "../domain/ports";
import { hashToken } from "../domain/tokens";
import { ResetPasswordUseCase } from "./reset-password.use-case";

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
    const row = this.rows.find((entry) => entry.id === id);
    return row === undefined ? null : { ...row };
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
    return null;
  }

  async restorePendingSession(
    _id: string,
    _issuedVersion: number,
  ): Promise<void> {
    return undefined;
  }

  async setPasswordAndIncrementVersionIfVersion(
    id: string,
    passwordHash: string,
    expectedVersion: number,
    newVersion: number,
  ): Promise<number | null> {
    const row = this.rows.find((entry) => entry.id === id);
    if (row === undefined || row.sessionVersion !== expectedVersion) {
      return null;
    }
    row.passwordHash = passwordHash;
    row.sessionVersion = newVersion;
    return newVersion;
  }

  async restorePasswordAndVersion(
    id: string,
    oldPasswordHash: string,
    issuedVersion: number,
  ): Promise<void> {
    const row = this.rows.find((entry) => entry.id === id);
    if (row !== undefined && row.sessionVersion === issuedVersion) {
      row.passwordHash = oldPasswordHash;
      row.sessionVersion = issuedVersion - 1;
    }
  }
}

class MemoryPasswordResetTokenRepository extends PasswordResetTokenRepository {
  rows: ResetTokenRow[] = [];

  async create(input: PasswordResetTokenInput): Promise<void> {
    this.rows.push({ ...input, usedAt: null });
  }

  async findNewestUnconsumedByUserId(
    userId: string,
  ): Promise<{ createdAt: Date } | null> {
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

  async claimByHash(tokenHash: string, now: Date): Promise<TokenClaim | null> {
    await Promise.resolve();
    const row = this.rows.find(
      (entry) =>
        entry.tokenHash === tokenHash &&
        entry.usedAt === null &&
        entry.expiresAt > now,
    );
    if (row === undefined) {
      return null;
    }
    row.usedAt = now;
    return { userId: row.userId, usedAt: now };
  }

  async releaseClaim(tokenHash: string, claimedUsedAt: Date): Promise<void> {
    const row = this.rows.find(
      (entry) =>
        entry.tokenHash === tokenHash && entry.usedAt === claimedUsedAt,
    );
    if (row !== undefined) {
      row.usedAt = null;
    }
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

class FakePasswordHasher extends PasswordHasher {
  readonly hashedInputs: string[] = [];

  async hash(plainPassword: string): Promise<string> {
    this.hashedInputs.push(plainPassword);
    return `hashed:${plainPassword}`;
  }

  async compare(plainPassword: string, passwordHash: string): Promise<boolean> {
    return passwordHash === `hashed:${plainPassword}`;
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
  useCase: ResetPasswordUseCase;
  unitOfWork: MemoryUnitOfWork;
  email: CapturingEmailService;
  hasher: FakePasswordHasher;
} {
  const unitOfWork = new MemoryUnitOfWork();
  const email = new CapturingEmailService();
  const hasher = new FakePasswordHasher();

  return {
    useCase: new ResetPasswordUseCase(unitOfWork, hasher, email),
    unitOfWork,
    email,
    hasher,
  };
}

function seedAccount(unitOfWork: MemoryUnitOfWork, sessionVersion = 0): string {
  const id = randomUUID();
  unitOfWork.accounts.rows.push({
    id,
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    passwordHash: "old-hash",
    status: "active",
    sessionVersion,
  });
  return id;
}

function seedToken(
  unitOfWork: MemoryUnitOfWork,
  userId: string,
  expiresAt = new Date(Date.now() + 60 * 60 * 1000),
): { rawToken: string; tokenHash: string } {
  const rawToken = `raw-token-${randomUUID()}`;
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  unitOfWork.passwordResetTokens.rows.push({
    id: randomUUID(),
    userId,
    tokenHash,
    expiresAt,
    createdAt: now,
    usedAt: null,
  });
  return { rawToken, tokenHash };
}

const PASSWORD = "a-new-password";

function inputFor(rawToken: string) {
  return { token: rawToken, password: PASSWORD, confirmPassword: PASSWORD };
}

describe("ResetPasswordUseCase", () => {
  it("consumes a valid token, replaces the hash, increments the version and notifies once", async () => {
    const { useCase, unitOfWork, email, hasher } = createUseCase();
    const userId = seedAccount(unitOfWork, 3);
    const { rawToken, tokenHash } = seedToken(unitOfWork, userId);

    await expect(useCase.execute(inputFor(rawToken))).resolves.toBeUndefined();

    const account = unitOfWork.accounts.rows.find((row) => row.id === userId);
    expect(account?.passwordHash).toBe(`hashed:${PASSWORD}`);
    expect(account?.sessionVersion).toBe(4);

    const token = unitOfWork.passwordResetTokens.rows.find(
      (row) => row.tokenHash === tokenHash,
    );
    expect(token?.usedAt).toBeInstanceOf(Date);
    expect(token?.tokenHash).toBe(tokenHash);

    expect(email.messages).toHaveLength(1);
    expect(email.messages[0]?.to).toBe("ada@example.com");
    expect(email.messages[0]?.subject).toBe("Your password has been reset");
    expect(email.messages[0]?.text).toContain("(UTC)");
    expect(email.messages[0]?.text).toContain(
      "If this wasn't you, reset it again immediately.",
    );
    expect(email.messages[0]?.text).not.toContain(rawToken);
    expect(email.messages[0]?.text).not.toContain("token=");
    expect(hasher.hashedInputs).toEqual([PASSWORD]);
  });

  it("rejects expired, used and unknown tokens without writes or email", async () => {
    const cases: Array<(context: ReturnType<typeof createUseCase>) => string> =
      [
        (context) => {
          const userId = seedAccount(context.unitOfWork);
          return seedToken(
            context.unitOfWork,
            userId,
            new Date(Date.now() - 60 * 1000),
          ).rawToken;
        },
        (context) => {
          const userId = seedAccount(context.unitOfWork);
          const rawToken = seedToken(context.unitOfWork, userId).rawToken;
          const row = context.unitOfWork.passwordResetTokens.rows[0]!;
          row.usedAt = new Date();
          return rawToken;
        },
        (context) => {
          seedAccount(context.unitOfWork);
          return "unknown-token";
        },
      ];

    for (const prepare of cases) {
      const context = createUseCase();
      const rawToken = prepare(context);
      const accountBefore = { ...context.unitOfWork.accounts.rows[0]! };

      await expect(context.useCase.execute(inputFor(rawToken))).rejects.toThrow(
        InvalidPasswordResetTokenError,
      );
      await expect(context.useCase.execute(inputFor(rawToken))).rejects.toThrow(
        "This password reset link is invalid or has expired.",
      );

      expect(context.unitOfWork.accounts.rows[0]).toEqual(accountBefore);
      expect(context.email.attempted).toHaveLength(0);
      expect(context.email.messages).toHaveLength(0);
    }
  });

  it("treats a stale account version as an invalid link and rolls back the claim", async () => {
    const { useCase, unitOfWork, email } = createUseCase();
    const userId = seedAccount(unitOfWork, 2);
    const { rawToken, tokenHash } = seedToken(unitOfWork, userId);
    vi.spyOn(
      unitOfWork.accounts,
      "setPasswordAndIncrementVersionIfVersion",
    ).mockResolvedValueOnce(null);

    await expect(useCase.execute(inputFor(rawToken))).rejects.toThrow(
      InvalidPasswordResetTokenError,
    );
    expect(
      unitOfWork.passwordResetTokens.rows.find(
        (row) => row.tokenHash === tokenHash,
      )?.usedAt,
    ).toBeNull();
    expect(email.attempted).toHaveLength(0);
  });

  it("restores hash, version and token usage when the notification fails", async () => {
    const { useCase, unitOfWork, email } = createUseCase();
    const userId = seedAccount(unitOfWork, 5);
    const { rawToken, tokenHash } = seedToken(unitOfWork, userId);
    email.shouldFail = true;

    await expect(useCase.execute(inputFor(rawToken))).rejects.toThrow(
      PasswordResetNotificationError,
    );

    const account = unitOfWork.accounts.rows.find((row) => row.id === userId);
    expect(account?.passwordHash).toBe("old-hash");
    expect(account?.sessionVersion).toBe(5);
    expect(
      unitOfWork.passwordResetTokens.rows.find(
        (row) => row.tokenHash === tokenHash,
      )?.usedAt,
    ).toBeNull();
    expect(email.attempted).toHaveLength(1);
    expect(email.messages).toHaveLength(0);

    email.shouldFail = false;
    await expect(useCase.execute(inputFor(rawToken))).resolves.toBeUndefined();
    expect(
      unitOfWork.accounts.rows.find((row) => row.id === userId)?.sessionVersion,
    ).toBe(6);
    expect(email.messages).toHaveLength(1);
  });

  it("claims the token only once under concurrent submissions", async () => {
    const { useCase, unitOfWork, email } = createUseCase();
    const userId = seedAccount(unitOfWork);
    const { rawToken } = seedToken(unitOfWork, userId);

    const results = await Promise.allSettled([
      useCase.execute(inputFor(rawToken)),
      useCase.execute(inputFor(rawToken)),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof InvalidPasswordResetTokenError,
      ),
    ).toHaveLength(1);
    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(1);
    expect(email.messages).toHaveLength(1);
  });
});
