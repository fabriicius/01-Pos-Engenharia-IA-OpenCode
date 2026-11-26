import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AccessTokenService } from "../src/auth/domain/access-token";
import { EmailService } from "../src/auth/domain/email";
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
} from "../src/auth/domain/ports";
import { hashToken } from "../src/auth/domain/tokens";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/setup";

class MemoryAccountRepository extends AccountRepository {
  rows: AccountRecord[] = [];

  async create(input: PendingAccountInput): Promise<void> {
    this.rows.push({ ...input, sessionVersion: 0 });
  }

  async remove(id: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.id !== id);
  }

  async findByEmail(email: string): Promise<AccountRecord | null> {
    const row = this.rows.find(
      (entry) => entry.email.toLowerCase() === email.toLowerCase(),
    );
    return row === undefined ? null : { ...row };
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
  rows: Array<PasswordResetTokenInput & { usedAt: Date | null }> = [];

  async create(input: PasswordResetTokenInput): Promise<void> {
    this.rows.push({ ...input, usedAt: null });
  }

  async findNewestUnconsumedByUserId(
    userId: string,
  ): Promise<{ createdAt: Date } | null> {
    const rows = this.rows.filter(
      (row) => row.userId === userId && row.usedAt === null,
    );
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

  async run<T>(
    work: (repositories: PersistencePorts) => Promise<T>,
  ): Promise<T> {
    return work(this.repositories);
  }
}

const ME_ENDPOINT = "/api/v1/auth/me";
const NEW_PASSWORD = "a-brand-new-password";

describe("reset password invalidates earlier sessions", () => {
  let app: INestApplication;
  let unitOfWork: MemoryUnitOfWork;
  let accessTokens: AccessTokenService;
  let passwordHasher: PasswordHasher;
  let emailSend: ReturnType<typeof vi.fn>;
  let accountId: string;
  let rawToken: string;
  let preResetToken: string;

  beforeAll(async () => {
    unitOfWork = new MemoryUnitOfWork();
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    vi.spyOn(app.get(UnitOfWork), "run").mockImplementation((work) =>
      unitOfWork.run(work),
    );
    emailSend = vi
      .spyOn(app.get(EmailService), "send")
      .mockResolvedValue(undefined);
    accessTokens = app.get(AccessTokenService);
    passwordHasher = app.get(PasswordHasher);
  });

  beforeEach(async () => {
    unitOfWork.accounts.rows = [];
    unitOfWork.passwordResetTokens.rows = [];
    emailSend.mockReset();
    emailSend.mockResolvedValue(undefined);

    accountId = randomUUID();
    unitOfWork.accounts.rows.push({
      id: accountId,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      passwordHash: await passwordHasher.hash("the-old-password"),
      status: "active",
      sessionVersion: 0,
    });
    rawToken = `reset-${randomUUID()}`;
    unitOfWork.passwordResetTokens.rows.push({
      id: randomUUID(),
      userId: accountId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      usedAt: null,
    });
    preResetToken = accessTokens.sign(accountId, 0);
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects the pre-reset JWT on /auth/me after a successful reset", async () => {
    const before = await request(app.getHttpServer())
      .get(ME_ENDPOINT)
      .set("Authorization", `Bearer ${preResetToken}`)
      .expect(200);
    expect(before.body.email).toBe("ada@example.com");

    await request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({
        token: rawToken,
        password: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get(ME_ENDPOINT)
      .set("Authorization", `Bearer ${preResetToken}`)
      .expect(401);

    expect(after.body).toEqual({
      statusCode: 401,
      error: "Unauthorized",
      message: "Unable to authenticate with the provided token.",
    });
    expect(JSON.stringify(after.body)).not.toContain("ada@example.com");
    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(1);
    expect(
      await passwordHasher.compare(
        NEW_PASSWORD,
        unitOfWork.accounts.rows[0]!.passwordHash,
      ),
    ).toBe(true);
  });

  it("accepts a JWT issued by signing in with the new password", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({
        token: rawToken,
        password: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      })
      .expect(200);

    const signIn = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send({ email: "ada@example.com", password: NEW_PASSWORD })
      .expect(200);

    expect(signIn.body.accessToken).toEqual(expect.any(String));
    await request(app.getHttpServer())
      .get(ME_ENDPOINT)
      .set("Authorization", `Bearer ${signIn.body.accessToken}`)
      .expect(200);
    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(2);
  });
});
