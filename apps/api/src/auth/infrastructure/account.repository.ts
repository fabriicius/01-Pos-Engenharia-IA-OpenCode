import { and, eq, sql } from "drizzle-orm";
import { DuplicateEmailError } from "../domain/errors";
import {
  AccountRecord,
  AccountRepository,
  PendingAccountInput,
} from "../domain/ports";
import { Transaction } from "./database";
import { isUniqueViolation } from "./pg-errors";
import { users } from "./schema";

export class DrizzleAccountRepository extends AccountRepository {
  constructor(private readonly transaction: Transaction) {
    super();
  }

  async create(input: PendingAccountInput): Promise<void> {
    try {
      await this.transaction.insert(users).values({
        id: input.id,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        passwordHash: input.passwordHash,
        status: input.status,
        createdAt: input.createdAt,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateEmailError();
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.transaction.delete(users).where(eq(users.id, id));
  }

  async findByEmail(email: string): Promise<AccountRecord | null> {
    const rows = await this.transaction
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
      .limit(1);

    return toAccountRecord(rows[0]);
  }

  async findByEmailForUpdate(email: string): Promise<AccountRecord | null> {
    const rows = await this.transaction
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
      .limit(1)
      .for("update");

    return toAccountRecord(rows[0]);
  }

  async findById(id: string): Promise<AccountRecord | null> {
    const rows = await this.transaction
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return toAccountRecord(rows[0]);
  }

  async incrementSessionVersion(id: string): Promise<number> {
    const rows = await this.transaction
      .update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, id))
      .returning({ sessionVersion: users.sessionVersion });

    const version = rows[0]?.sessionVersion;
    if (version === undefined) {
      throw new Error("Account not found while incrementing session version.");
    }
    return version;
  }

  async setSessionVersionIfVersion(
    id: string,
    expectedVersion: number,
    newVersion: number,
  ): Promise<void> {
    await this.transaction
      .update(users)
      .set({ sessionVersion: newVersion })
      .where(and(eq(users.id, id), eq(users.sessionVersion, expectedVersion)));
  }

  async activateIfPending(id: string): Promise<number | null> {
    const rows = await this.transaction
      .update(users)
      .set({
        status: "active",
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(and(eq(users.id, id), eq(users.status, "pending")))
      .returning({ sessionVersion: users.sessionVersion });

    return rows[0]?.sessionVersion ?? null;
  }

  async restorePendingSession(
    id: string,
    issuedVersion: number,
  ): Promise<void> {
    await this.transaction
      .update(users)
      .set({ status: "pending", sessionVersion: issuedVersion - 1 })
      .where(
        and(
          eq(users.id, id),
          eq(users.status, "active"),
          eq(users.sessionVersion, issuedVersion),
        ),
      );
  }

  async setPasswordAndIncrementVersionIfVersion(
    id: string,
    passwordHash: string,
    expectedVersion: number,
    newVersion: number,
  ): Promise<number | null> {
    const rows = await this.transaction
      .update(users)
      .set({ passwordHash, sessionVersion: newVersion })
      .where(and(eq(users.id, id), eq(users.sessionVersion, expectedVersion)))
      .returning({ sessionVersion: users.sessionVersion });

    return rows[0]?.sessionVersion ?? null;
  }

  async restorePasswordAndVersion(
    id: string,
    oldPasswordHash: string,
    issuedVersion: number,
  ): Promise<void> {
    await this.transaction
      .update(users)
      .set({
        passwordHash: oldPasswordHash,
        sessionVersion: issuedVersion - 1,
      })
      .where(and(eq(users.id, id), eq(users.sessionVersion, issuedVersion)));
  }
}

type UserRow = typeof users.$inferSelect;

function toAccountRecord(row: UserRow | undefined): AccountRecord | null {
  if (row === undefined) {
    return null;
  }

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    passwordHash: row.passwordHash,
    status: row.status,
    sessionVersion: row.sessionVersion,
  };
}
