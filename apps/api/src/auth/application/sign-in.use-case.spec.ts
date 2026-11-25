import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { AccessTokenClaims, AccessTokenService } from "../domain/access-token";
import {
  AccountNotConfirmedError,
  InvalidCredentialsError,
  SessionNotificationError,
} from "../domain/errors";
import { EmailMessage, EmailService } from "../domain/email";
import {
  AccountRecord,
  AccountRepository,
  ConfirmationTokenInput,
  ConfirmationTokenRepository,
  PasswordHasher,
  PendingAccountInput,
  PersistencePorts,
  UnitOfWork,
} from "../domain/ports";
import { SignInUseCase } from "./sign-in.use-case";

const PASSWORD = "a-long-enough-password";

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
}

class MemoryUnitOfWork extends UnitOfWork {
  readonly accounts = new MemoryAccountRepository();
  readonly repositories: PersistencePorts = {
    accounts: this.accounts,
    confirmationTokens: new MemoryConfirmationTokenRepository(),
  };

  async run<T>(
    work: (repositories: PersistencePorts) => Promise<T>,
  ): Promise<T> {
    return work(this.repositories);
  }
}

class MemoryConfirmationTokenRepository extends ConfirmationTokenRepository {
  async create(_input: ConfirmationTokenInput): Promise<void> {
    return undefined;
  }

  async removeByUserId(_userId: string): Promise<void> {
    return undefined;
  }
}

class DeterministicPasswordHasher extends PasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return `hashed:${plainPassword}`;
  }

  async compare(plainPassword: string, passwordHash: string): Promise<boolean> {
    return passwordHash === `hashed:${plainPassword}`;
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
  useCase: SignInUseCase;
  unitOfWork: MemoryUnitOfWork;
  tokens: FakeAccessTokenService;
  emailService: CapturingEmailService;
} {
  const unitOfWork = new MemoryUnitOfWork();
  const tokens = new FakeAccessTokenService();
  const emailService = new CapturingEmailService();

  return {
    useCase: new SignInUseCase(
      unitOfWork,
      new DeterministicPasswordHasher(),
      tokens,
      emailService,
      new ConfigService({}),
    ),
    unitOfWork,
    tokens,
    emailService,
  };
}

async function addAccount(
  unitOfWork: MemoryUnitOfWork,
  status: "pending" | "active" = "active",
): Promise<AccountRecord> {
  const input: PendingAccountInput = {
    id: "account-uuid",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    passwordHash: `hashed:${PASSWORD}`,
    status: "pending",
    createdAt: new Date(),
  };
  await unitOfWork.accounts.create(input);
  if (status === "active") {
    unitOfWork.accounts.rows[0]!.status = "active";
  }
  return unitOfWork.accounts.rows[0]!;
}

describe("SignInUseCase", () => {
  it("increments the version, issues a token for it and sends the notification", async () => {
    const { useCase, unitOfWork, tokens, emailService } = createUseCase();
    await addAccount(unitOfWork);

    const result = await useCase.execute({
      email: "ADA@EXAMPLE.COM",
      password: PASSWORD,
    });

    expect(result).toEqual({
      accessToken: "token-1",
      tokenType: "Bearer",
      expiresIn: 86400,
    });
    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(1);
    expect(tokens.signed).toEqual([{ accountId: "account-uuid", version: 1 }]);
    expect(emailService.messages).toHaveLength(1);
    expect(emailService.messages[0]?.to).toBe("ada@example.com");
    expect(emailService.messages[0]?.subject).toBe("A new session was created");
    expect(emailService.messages[0]?.text).toContain("UTC");
    expect(emailService.messages[0]?.text).toContain(
      "If this wasn't you, change your password.",
    );
  });

  it("rejects a pending account with the correct password without side effects", async () => {
    const { useCase, unitOfWork, tokens, emailService } = createUseCase();
    await addAccount(unitOfWork, "pending");

    await expect(
      useCase.execute({ email: "ada@example.com", password: PASSWORD }),
    ).rejects.toBeInstanceOf(AccountNotConfirmedError);

    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(0);
    expect(tokens.signed).toHaveLength(0);
    expect(emailService.messages).toHaveLength(0);
  });

  it("uses the same error for an unknown email and a wrong password", async () => {
    const { useCase, unitOfWork, tokens, emailService } = createUseCase();
    await addAccount(unitOfWork);

    const unknown = useCase.execute({
      email: "nobody@example.com",
      password: PASSWORD,
    });
    const wrongPassword = useCase.execute({
      email: "ada@example.com",
      password: "not-the-password",
    });

    await expect(unknown).rejects.toEqual(new InvalidCredentialsError());
    await expect(wrongPassword).rejects.toEqual(new InvalidCredentialsError());
    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(0);
    expect(tokens.signed).toHaveLength(0);
    expect(emailService.messages).toHaveLength(0);
  });

  it("compensates a failed notification with a conditional version restore", async () => {
    const { useCase, unitOfWork, tokens, emailService } = createUseCase();
    await addAccount(unitOfWork);
    emailService.shouldFail = true;

    await expect(
      useCase.execute({ email: "ada@example.com", password: PASSWORD }),
    ).rejects.toBeInstanceOf(SessionNotificationError);

    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(0);
    expect(tokens.signed).toHaveLength(1);
  });

  it("does not clobber a concurrent login when compensation runs", async () => {
    const { useCase, unitOfWork, emailService } = createUseCase();
    await addAccount(unitOfWork);

    let attempt = 0;
    emailService.send = async (message) => {
      attempt += 1;
      if (attempt === 1) {
        await unitOfWork.accounts.incrementSessionVersion("account-uuid");
        throw new Error("SMTP down");
      }
      emailService.messages.push(message);
    };

    await expect(
      useCase.execute({ email: "ada@example.com", password: PASSWORD }),
    ).rejects.toBeInstanceOf(SessionNotificationError);

    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(2);
  });

  it("keeps the versions of two concurrent sign-ins distinct", async () => {
    const { useCase, unitOfWork, tokens } = createUseCase();
    await addAccount(unitOfWork);

    const [first, second] = await Promise.all([
      useCase.execute({ email: "ada@example.com", password: PASSWORD }),
      useCase.execute({ email: "ada@example.com", password: PASSWORD }),
    ]);

    expect([first.accessToken, second.accessToken].sort()).toEqual([
      "token-1",
      "token-2",
    ]);
    expect(unitOfWork.accounts.rows[0]?.sessionVersion).toBe(2);
    expect(tokens.signed.map((entry) => entry.version).sort()).toEqual([1, 2]);
  });
});
