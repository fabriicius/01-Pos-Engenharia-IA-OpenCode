import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AccessTokenClaims, AccessTokenService } from "../domain/access-token";
import {
  InvalidConfirmationTokenError,
  SessionNotificationError,
} from "../domain/errors";
import { EmailMessage, EmailService } from "../domain/email";
import {
  AccountRecord,
  AccountRepository,
  ConfirmationTokenInput,
  ConfirmationTokenRepository,
  PendingAccountInput,
  PersistencePorts,
  TokenClaim,
  UnitOfWork,
} from "../domain/ports";
import { hashToken } from "../domain/tokens";
import { ConfirmAccountUseCase } from "./confirm-account.use-case";

interface TokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
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
    return this.rows.find((row) => row.email === email) ?? null;
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

  async activateIfPending(id: string): Promise<number | null> {
    const row = this.rows.find((entry) => entry.id === id);
    if (row === undefined || row.status !== "pending") {
      return null;
    }
    row.status = "active";
    row.sessionVersion += 1;
    return row.sessionVersion;
  }

  async restorePendingSession(
    id: string,
    issuedVersion: number,
  ): Promise<void> {
    const row = this.rows.find((entry) => entry.id === id);
    if (
      row !== undefined &&
      row.status === "active" &&
      row.sessionVersion === issuedVersion
    ) {
      row.status = "pending";
      row.sessionVersion = issuedVersion - 1;
    }
  }
}

class MemoryConfirmationTokenRepository extends ConfirmationTokenRepository {
  rows: TokenRow[] = [];

  async create(input: ConfirmationTokenInput): Promise<void> {
    this.rows.push({ ...input });
  }

  async removeByUserId(userId: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.userId !== userId);
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

class MemoryUnitOfWork extends UnitOfWork {
  readonly accounts = new MemoryAccountRepository();
  readonly confirmationTokens = new MemoryConfirmationTokenRepository();
  readonly repositories: PersistencePorts = {
    accounts: this.accounts,
    confirmationTokens: this.confirmationTokens,
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
    const tokenRows = this.confirmationTokens.rows.map((row) => ({ ...row }));
    try {
      return await work(this.repositories);
    } catch (error) {
      this.accounts.rows = accountRows;
      this.confirmationTokens.rows = tokenRows;
      throw error;
    } finally {
      release();
    }
  }
}

class FakeAccessTokenService extends AccessTokenService {
  readonly signed: Array<{ accountId: string; version: number }> = [];

  sign(accountId: string, version: number): string {
    this.signed.push({ accountId, version });
    return `token-${version}`;
  }

  verify(_token: string): AccessTokenClaims | null {
    return null;
  }
}

class CapturingEmailService extends EmailService {
  readonly messages: EmailMessage[] = [];
  shouldFail = false;

  async send(message: EmailMessage): Promise<void> {
    if (this.shouldFail) {
      throw new Error("SMTP down");
    }
    this.messages.push(message);
  }
}

function createUseCase(): {
  useCase: ConfirmAccountUseCase;
  unitOfWork: MemoryUnitOfWork;
  tokens: FakeAccessTokenService;
  email: CapturingEmailService;
} {
  const unitOfWork = new MemoryUnitOfWork();
  const tokens = new FakeAccessTokenService();
  const email = new CapturingEmailService();
  const config = new ConfigService({ APP_URL: "http://localhost:5173/" });

  return {
    useCase: new ConfirmAccountUseCase(unitOfWork, tokens, email, config),
    unitOfWork,
    tokens,
    email,
  };
}

function seedAccount(
  unitOfWork: MemoryUnitOfWork,
  status: "pending" | "active" = "pending",
  sessionVersion = 2,
): string {
  const id = randomUUID();
  unitOfWork.accounts.rows.push({
    id,
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    passwordHash: "hashed-password",
    status,
    sessionVersion,
  });
  return id;
}

function seedToken(
  unitOfWork: MemoryUnitOfWork,
  userId: string,
  rawToken: string,
  expiresAt = new Date(Date.now() + 60_000),
): void {
  unitOfWork.confirmationTokens.rows.push({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(rawToken),
    expiresAt,
    usedAt: null,
    createdAt: new Date(),
  });
}

describe("ConfirmAccountUseCase", () => {
  it("activates the account, claims the token and issues the first session", async () => {
    const { useCase, unitOfWork, tokens, email } = createUseCase();
    const userId = seedAccount(unitOfWork);
    const token = "valid-token";
    const tokenHash = hashToken(token);
    seedToken(unitOfWork, userId, token);

    const result = await useCase.execute({ token });

    expect(result).toEqual({
      accessToken: "token-3",
      tokenType: "Bearer",
      expiresIn: 86400,
    });
    expect(unitOfWork.accounts.rows[0]).toMatchObject({
      id: userId,
      status: "active",
      sessionVersion: 3,
    });
    expect(unitOfWork.confirmationTokens.rows[0]).toMatchObject({
      userId,
      tokenHash,
    });
    expect(unitOfWork.confirmationTokens.rows[0]?.usedAt).toBeInstanceOf(Date);
    expect(tokens.signed).toEqual([{ accountId: userId, version: 3 }]);
    expect(email.messages).toHaveLength(1);
    expect(email.messages[0]?.subject).toBe("A new session was created");
    expect(email.messages[0]?.to).toBe("ada@example.com");
    expect(email.messages[0]?.text).toContain("(UTC).");
    expect(email.messages[0]?.text).toContain(
      "If this wasn't you, change your password.",
    );
    expect(email.messages[0]?.text).toContain("http://localhost:5173/app/home");
  });

  it("rejects a replay without a second session, version increment or email", async () => {
    const { useCase, unitOfWork, email } = createUseCase();
    const userId = seedAccount(unitOfWork);
    seedToken(unitOfWork, userId, "valid-token");
    await useCase.execute({ token: "valid-token" });

    await expect(useCase.execute({ token: "valid-token" })).rejects.toThrow(
      InvalidConfirmationTokenError,
    );

    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(3);
    expect(email.messages).toHaveLength(1);
  });

  it("rejects an expired token and leaves the account pending and token unused", async () => {
    const { useCase, unitOfWork, email } = createUseCase();
    const userId = seedAccount(unitOfWork);
    seedToken(unitOfWork, userId, "expired-token", new Date(0));

    await expect(useCase.execute({ token: "expired-token" })).rejects.toThrow(
      InvalidConfirmationTokenError,
    );

    expect(unitOfWork.accounts.rows[0]).toMatchObject({
      status: "pending",
      sessionVersion: 2,
    });
    expect(unitOfWork.confirmationTokens.rows[0]?.usedAt).toBeNull();
    expect(email.messages).toHaveLength(0);
  });

  it("rejects an unknown token without changing any account", async () => {
    const { useCase, unitOfWork, email } = createUseCase();
    seedAccount(unitOfWork);

    await expect(useCase.execute({ token: "unknown-token" })).rejects.toThrow(
      InvalidConfirmationTokenError,
    );

    expect(unitOfWork.accounts.rows[0]).toMatchObject({
      status: "pending",
      sessionVersion: 2,
    });
    expect(email.messages).toHaveLength(0);
  });

  it("rejects an unused token on an already-active account and rolls the claim back", async () => {
    const { useCase, unitOfWork, email } = createUseCase();
    const userId = seedAccount(unitOfWork, "active");
    seedToken(unitOfWork, userId, "valid-token");

    await expect(useCase.execute({ token: "valid-token" })).rejects.toThrow(
      InvalidConfirmationTokenError,
    );

    expect(unitOfWork.confirmationTokens.rows[0]?.usedAt).toBeNull();
    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(2);
    expect(email.messages).toHaveLength(0);
  });

  it("lets only one of two concurrent submissions claim the token", async () => {
    const { useCase, unitOfWork, email } = createUseCase();
    const userId = seedAccount(unitOfWork);
    seedToken(unitOfWork, userId, "valid-token");

    const outcomes = await Promise.allSettled([
      useCase.execute({ token: "valid-token" }),
      useCase.execute({ token: "valid-token" }),
    ]);

    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(3);
    expect(email.messages).toHaveLength(1);
  });

  it("restores status, token usage and version when the email fails", async () => {
    const { useCase, unitOfWork, email } = createUseCase();
    const userId = seedAccount(unitOfWork);
    const tokenHash = hashToken("valid-token");
    seedToken(unitOfWork, userId, "valid-token");
    email.shouldFail = true;

    await expect(useCase.execute({ token: "valid-token" })).rejects.toThrow(
      SessionNotificationError,
    );

    expect(unitOfWork.accounts.rows[0]).toMatchObject({
      id: userId,
      status: "pending",
      sessionVersion: 2,
    });
    expect(unitOfWork.confirmationTokens.rows[0]?.usedAt).toBeNull();
    expect(unitOfWork.confirmationTokens.rows[0]?.tokenHash).toBe(tokenHash);
    expect(email.messages).toHaveLength(0);
  });
});
