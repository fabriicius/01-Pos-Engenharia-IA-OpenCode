export interface PendingAccountInput {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  status: "pending";
  createdAt: Date;
}

export interface ConfirmationTokenInput {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: null;
  createdAt: Date;
}

export interface AccountRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  status: "pending" | "active";
  sessionVersion: number;
}

export interface TokenClaim {
  userId: string;
  usedAt: Date;
}

export interface PersistencePorts {
  accounts: AccountRepository;
  confirmationTokens: ConfirmationTokenRepository;
}

export abstract class AccountRepository {
  abstract create(input: PendingAccountInput): Promise<void>;
  abstract remove(id: string): Promise<void>;
  abstract findByEmail(email: string): Promise<AccountRecord | null>;
  abstract findById(id: string): Promise<AccountRecord | null>;
  abstract incrementSessionVersion(id: string): Promise<number>;
  abstract setSessionVersionIfVersion(
    id: string,
    expectedVersion: number,
    newVersion: number,
  ): Promise<void>;
  abstract activateIfPending(id: string): Promise<number | null>;
  abstract restorePendingSession(
    id: string,
    issuedVersion: number,
  ): Promise<void>;
}

export abstract class ConfirmationTokenRepository {
  abstract create(input: ConfirmationTokenInput): Promise<void>;
  abstract removeByUserId(userId: string): Promise<void>;
  abstract claimByHash(
    tokenHash: string,
    now: Date,
  ): Promise<TokenClaim | null>;
  abstract releaseClaim(tokenHash: string, claimedUsedAt: Date): Promise<void>;
}

export abstract class PasswordHasher {
  abstract hash(plainPassword: string): Promise<string>;
  abstract compare(
    plainPassword: string,
    passwordHash: string,
  ): Promise<boolean>;
}

export abstract class UnitOfWork {
  abstract run<T>(
    work: (repositories: PersistencePorts) => Promise<T>,
  ): Promise<T>;
}
