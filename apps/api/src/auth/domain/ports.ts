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

export interface PersistencePorts {
  accounts: AccountRepository;
  confirmationTokens: ConfirmationTokenRepository;
}

export abstract class AccountRepository {
  abstract create(input: PendingAccountInput): Promise<void>;
  abstract remove(id: string): Promise<void>;
}

export abstract class ConfirmationTokenRepository {
  abstract create(input: ConfirmationTokenInput): Promise<void>;
  abstract removeByUserId(userId: string): Promise<void>;
}

export abstract class PasswordHasher {
  abstract hash(plainPassword: string): Promise<string>;
}

export abstract class UnitOfWork {
  abstract run<T>(
    work: (repositories: PersistencePorts) => Promise<T>,
  ): Promise<T>;
}
