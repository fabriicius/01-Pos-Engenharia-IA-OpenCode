import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SignUpUseCase } from "../src/auth/application/sign-up.use-case";
import { DuplicateEmailError } from "../src/auth/domain/errors";
import { EmailService } from "../src/auth/domain/email";
import {
  AccountRecord,
  AccountRepository,
  ConfirmationTokenInput,
  ConfirmationTokenRepository,
  PasswordHasher,
  PendingAccountInput,
  PersistencePorts,
  TokenClaim,
  UnitOfWork,
} from "../src/auth/domain/ports";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/setup";

const VALID_SIGN_UP = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  password: "a-long-enough-password",
  confirmPassword: "a-long-enough-password",
};

const SUCCESS_MESSAGE =
  "Account created. Check your email to confirm your account.";

describe("POST /api/v1/auth/sign-up HTTP contract", () => {
  let app: INestApplication;
  let execute: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    execute = vi
      .spyOn(app.get(SignUpUseCase), "execute")
      .mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 201 with an en-US acknowledgement and no secrets", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-up")
      .send(VALID_SIGN_UP)
      .expect(201);

    expect(response.body).toEqual({ message: SUCCESS_MESSAGE });
    expect(JSON.stringify(response.body)).not.toContain(VALID_SIGN_UP.password);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects mismatched passwords with 400", async () => {
    execute.mockClear();

    await request(app.getHttpServer())
      .post("/api/v1/auth/sign-up")
      .send({ ...VALID_SIGN_UP, confirmPassword: "something-else" })
      .expect(400);

    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 8 characters with 400", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/sign-up")
      .send({
        ...VALID_SIGN_UP,
        password: "short",
        confirmPassword: "short",
      })
      .expect(400);
  });

  it("rejects unknown fields with 400", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/sign-up")
      .send({ ...VALID_SIGN_UP, isAdmin: true })
      .expect(400);
  });

  it("keeps the unprefixed GET / hello-world contract", async () => {
    await request(app.getHttpServer())
      .get("/")
      .expect(200, { message: "Hello World" });
  });
});

class RecordingAccountRepository extends AccountRepository {
  constructor(private readonly owner: RecordingUnitOfWork) {
    super();
  }

  async create(input: PendingAccountInput): Promise<void> {
    this.owner.accounts.push(input);
  }

  async remove(id: string): Promise<void> {
    this.owner.removedAccountIds.push(id);
  }

  async findByEmail(email: string): Promise<AccountRecord | null> {
    const row = this.owner.accounts.find(
      (entry) => entry.email === email.toLowerCase(),
    );
    return row === undefined ? null : { ...row, sessionVersion: 0 };
  }

  async findById(id: string): Promise<AccountRecord | null> {
    const row = this.owner.accounts.find((entry) => entry.id === id);
    return row === undefined ? null : { ...row, sessionVersion: 0 };
  }

  async incrementSessionVersion(_id: string): Promise<number> {
    return 1;
  }

  async setSessionVersionIfVersion(
    _id: string,
    _expectedVersion: number,
    _newVersion: number,
  ): Promise<void> {
    return undefined;
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
}

class RecordingConfirmationTokenRepository extends ConfirmationTokenRepository {
  constructor(private readonly owner: RecordingUnitOfWork) {
    super();
  }

  async create(input: ConfirmationTokenInput): Promise<void> {
    this.owner.tokens.push(input);
  }

  async removeByUserId(userId: string): Promise<void> {
    this.owner.removedTokenUserIds.push(userId);
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

class RecordingUnitOfWork extends UnitOfWork {
  readonly accounts: PendingAccountInput[] = [];
  readonly tokens: ConfirmationTokenInput[] = [];
  readonly removedAccountIds: string[] = [];
  readonly removedTokenUserIds: string[] = [];
  errorToThrow?: Error;

  async run<T>(
    work: (repositories: PersistencePorts) => Promise<T>,
  ): Promise<T> {
    if (this.errorToThrow) {
      throw this.errorToThrow;
    }

    return work({
      accounts: new RecordingAccountRepository(this),
      confirmationTokens: new RecordingConfirmationTokenRepository(this),
    });
  }
}

describe("POST /api/v1/auth/sign-up failure mapping", () => {
  let app: INestApplication;
  let recorder: RecordingUnitOfWork;
  let emailSend: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    recorder = new RecordingUnitOfWork();

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    vi.spyOn(app.get(UnitOfWork), "run").mockImplementation((work) =>
      recorder.run(work),
    );
    vi.spyOn(app.get(PasswordHasher), "hash").mockResolvedValue(
      "hashed-password",
    );
    emailSend = vi
      .spyOn(app.get(EmailService), "send")
      .mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  it("maps a duplicate email to 409 and does not send an email", async () => {
    recorder.errorToThrow = new DuplicateEmailError();
    emailSend.mockClear();

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-up")
      .send({ ...VALID_SIGN_UP, email: "ADA@EXAMPLE.COM" })
      .expect(409);

    expect(response.body.message).toBe(
      "Unable to create account with this email address.",
    );
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("maps an adapter failure to 502 and compensates persistence", async () => {
    recorder.errorToThrow = undefined;
    recorder.accounts.length = 0;
    recorder.tokens.length = 0;
    recorder.removedAccountIds.length = 0;
    recorder.removedTokenUserIds.length = 0;
    emailSend.mockRejectedValueOnce(new Error("SMTP down"));

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-up")
      .send(VALID_SIGN_UP)
      .expect(502);

    expect(response.body.message).toBe(
      "Unable to create account. Please try again.",
    );
    expect(JSON.stringify(response.body)).not.toContain(VALID_SIGN_UP.password);
    expect(recorder.accounts).toHaveLength(1);
    expect(recorder.tokens).toHaveLength(1);
    expect(recorder.removedAccountIds).toEqual([recorder.accounts[0]?.id]);
    expect(recorder.removedTokenUserIds).toEqual([recorder.accounts[0]?.id]);
  });
});
