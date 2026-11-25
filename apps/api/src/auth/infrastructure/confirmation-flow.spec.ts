import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountRepository } from "../domain/ports";
import { DrizzleAccountRepository } from "./account.repository";
import { DrizzleConfirmationTokenRepository } from "./confirmation-token.repository";
import { Transaction } from "./database";
import { accountConfirmationTokens, users } from "./schema";

// eslint-disable-next-line turbo/no-undeclared-env-vars -- opt-in local DB probe
const RUN_DB_PROBE = process.env.RUN_DB_PROBE === "1";

describe.skipIf(!RUN_DB_PROBE)(
  "confirmation SQL against local Postgres",
  () => {
    let pool: Pool;
    let transaction: Transaction;
    let accounts: AccountRepository;
    let confirmationTokens: DrizzleConfirmationTokenRepository;
    const createdUserIds: string[] = [];

    beforeAll(async () => {
      pool = new Pool({
        connectionString:
          // eslint-disable-next-line turbo/no-undeclared-env-vars -- opt-in local DB probe
          process.env.DATABASE_URL ??
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      });
      const db = drizzle(pool, {
        schema: { users, accountConfirmationTokens },
      });
      transaction = db as unknown as Transaction;
      accounts = new DrizzleAccountRepository(transaction);
      confirmationTokens = new DrizzleConfirmationTokenRepository(transaction);
    });

    afterAll(async () => {
      const db = drizzle(pool, {
        schema: { users, accountConfirmationTokens },
      });
      for (const userId of createdUserIds) {
        await db.delete(users).where(eq(users.id, userId));
      }
      await pool.end();
    });

    async function seedToken(
      userId: string,
      tokenHash: string,
      expiresAt: Date,
    ): Promise<void> {
      createdUserIds.push(userId);
      await transaction.insert(users).values({
        id: userId,
        firstName: "Ada",
        lastName: "Lovelace",
        email: `${userId}@example.com`,
        passwordHash: "hash",
        status: "pending",
        sessionVersion: 2,
      });
      await transaction.insert(accountConfirmationTokens).values({
        id: randomUUID(),
        userId,
        tokenHash,
        expiresAt,
        usedAt: null,
      });
    }

    it("claims only an unexpired unused token and rolls back with release", async () => {
      const userId = randomUUID();
      const tokenHash = randomUUID();
      const now = new Date();

      await seedToken(userId, tokenHash, new Date(now.getTime() + 60_000));

      const claim = await confirmationTokens.claimByHash(tokenHash, now);
      expect(claim?.userId).toBe(userId);
      expect(claim?.usedAt).toBeInstanceOf(Date);
      expect(await confirmationTokens.claimByHash(tokenHash, now)).toBeNull();

      await confirmationTokens.releaseClaim(tokenHash, claim!.usedAt);
      const reclaimed = await confirmationTokens.claimByHash(tokenHash, now);
      expect(reclaimed?.userId).toBe(userId);

      const version = await accounts.activateIfPending(userId);
      expect(version).toBe(3);
      expect(await accounts.activateIfPending(userId)).toBeNull();

      await accounts.restorePendingSession(userId, version!);
      const account = await accounts.findById(userId);
      expect(account?.status).toBe("pending");
      expect(account?.sessionVersion).toBe(2);
    });

    it("rejects expired and unknown tokens without changing a row", async () => {
      const userId = randomUUID();
      const expiredHash = randomUUID();
      const now = new Date();

      await seedToken(userId, expiredHash, new Date(now.getTime() - 60_000));

      expect(await confirmationTokens.claimByHash(expiredHash, now)).toBeNull();
      expect(
        await confirmationTokens.claimByHash(randomUUID(), now),
      ).toBeNull();

      const rows = await transaction
        .select()
        .from(accountConfirmationTokens)
        .where(
          and(
            eq(accountConfirmationTokens.userId, userId),
            eq(accountConfirmationTokens.tokenHash, expiredHash),
          ),
        );
      expect(rows[0]?.usedAt).toBeNull();
    });
  },
);
