import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
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
import {
  AccessTokenClaims,
  AccessTokenService,
} from "../src/auth/domain/access-token";
import {
  AccountRecord,
  AccountRepository,
  ConfirmationTokenInput,
  ConfirmationTokenRepository,
  LatestPasswordResetToken,
  PasswordHasher,
  PasswordResetTokenInput,
  PasswordResetTokenRepository,
  PendingAccountInput,
  PersistencePorts,
  TokenClaim,
  UnitOfWork,
} from "../src/auth/domain/ports";
import { EmailService } from "../src/auth/domain/email";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/setup";

const PASSWORD = "a-long-enough-password";
const GENERIC_401 = "Unable to sign in with the provided credentials.";
const CREDENTIALS = { email: "ada@example.com", password: PASSWORD };

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

class MemoryConfirmationTokenRepository extends ConfirmationTokenRepository {
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

class NoopPasswordResetTokenRepository extends PasswordResetTokenRepository {
  async create(_input: PasswordResetTokenInput): Promise<void> {
    return undefined;
  }

  async findNewestUnconsumedByUserId(
    _userId: string,
  ): Promise<LatestPasswordResetToken | null> {
    return null;
  }

  async invalidateUnconsumedByUserId(
    _userId: string,
    _now: Date,
  ): Promise<void> {
    return undefined;
  }

  async removeById(_id: string): Promise<void> {
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
  readonly repositories: PersistencePorts = {
    accounts: this.accounts,
    confirmationTokens: new MemoryConfirmationTokenRepository(),
    passwordResetTokens: new NoopPasswordResetTokenRepository(),
  };

  async run<T>(
    work: (repositories: PersistencePorts) => Promise<T>,
  ): Promise<T> {
    return work(this.repositories);
  }
}

class SimpleAccessTokenService extends AccessTokenService {
  sign(_accountId: string, version: number): string {
    return `token-${version}`;
  }

  verify(token: string): AccessTokenClaims | null {
    const match = /^token-(\d+)$/.exec(token);
    if (match === null) {
      return null;
    }
    return {
      sub: "account-uuid",
      ver: Number(match[1]),
      iat: 1000,
      exp: 1000 + 86400,
    };
  }
}

describe("sign-in and /auth/me HTTP contract", () => {
  let app: INestApplication;
  let unitOfWork: MemoryUnitOfWork;
  let emailSend: ReturnType<typeof vi.fn>;
  let compare: ReturnType<typeof vi.fn>;

  async function seedAccount(status: "pending" | "active"): Promise<void> {
    await unitOfWork.accounts.create({
      id: "account-uuid",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      passwordHash: "hashed-password",
      status: "pending",
      createdAt: new Date(),
    });
    if (status === "active") {
      unitOfWork.accounts.rows[0]!.status = "active";
    }
  }

  beforeAll(async () => {
    unitOfWork = new MemoryUnitOfWork();

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    vi.spyOn(app.get(UnitOfWork), "run").mockImplementation((work) =>
      unitOfWork.run(work),
    );
    compare = vi
      .spyOn(app.get(PasswordHasher), "compare")
      .mockResolvedValue(true);
    vi.spyOn(app.get(AccessTokenService), "sign").mockImplementation(
      (_accountId, version) => `token-${version}`,
    );
    vi.spyOn(app.get(AccessTokenService), "verify").mockImplementation(
      (token) => new SimpleAccessTokenService().verify(token),
    );
    emailSend = vi
      .spyOn(app.get(EmailService), "send")
      .mockResolvedValue(undefined);
  });

  beforeEach(() => {
    unitOfWork.accounts.rows = [];
    compare.mockResolvedValue(true);
    emailSend.mockReset();
    emailSend.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with only the token, type and TTL for valid credentials", async () => {
    await seedAccount("active");

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send(CREDENTIALS)
      .expect(200);

    expect(response.body).toEqual({
      accessToken: "token-1",
      tokenType: "Bearer",
      expiresIn: 86400,
    });
    expect(JSON.stringify(response.body)).not.toContain(PASSWORD);
    expect(emailSend).toHaveBeenCalledTimes(1);
  });

  it("rejects empty, malformed and unknown fields with 400", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send({ email: "", password: "" })
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send({ email: "not-an-email", password: PASSWORD })
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send({ ...CREDENTIALS, isAdmin: true })
      .expect(400);
  });

  it("uses one generic 401 for unknown email and wrong password", async () => {
    await seedAccount("active");

    const unknown = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send({ ...CREDENTIALS, email: "nobody@example.com" })
      .expect(401);
    compare.mockResolvedValue(false);
    const wrongPassword = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send(CREDENTIALS)
      .expect(401);

    expect(unknown.body.message).toBe(GENERIC_401);
    expect(wrongPassword.body.message).toBe(GENERIC_401);
    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(0);
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("returns 403 for a pending account with the correct password", async () => {
    await seedAccount("pending");

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send(CREDENTIALS)
      .expect(403);

    expect(response.body.message).toBe(
      "Please confirm your account before signing in.",
    );
    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(0);
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("returns 502 and restores the version when the email adapter fails", async () => {
    await seedAccount("active");
    emailSend.mockRejectedValueOnce(new Error("SMTP down"));

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send(CREDENTIALS)
      .expect(502);

    expect(response.body.message).toBe("Unable to sign in. Please try again.");
    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(0);
  });

  it("accepts the current token at /auth/me without exposing secrets", async () => {
    await seedAccount("active");
    const signed = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send(CREDENTIALS)
      .expect(200);

    const response = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${signed.body.accessToken as string}`)
      .expect(200);

    expect(response.body).toEqual({
      id: "account-uuid",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
    });
    expect(JSON.stringify(response.body)).not.toContain(PASSWORD);
  });

  it("rejects stale, malformed and missing tokens at /auth/me", async () => {
    await seedAccount("active");

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer token-99")
      .expect(401);
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer bad-signature")
      .expect(401);
    const missing = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .expect(401);

    expect(missing.body.message).toBe(
      "Unable to authenticate with the provided token.",
    );
  });

  it("keeps the unprefixed GET / hello-world contract", async () => {
    await request(app.getHttpServer())
      .get("/")
      .expect(200, { message: "Hello World" });
  });
});
