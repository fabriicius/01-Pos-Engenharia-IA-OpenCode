import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountRepository, PasswordResetTokenInput } from "../domain/ports";
import { DrizzleAccountRepository } from "./account.repository";
import { DrizzlePasswordResetTokenRepository } from "./password-reset-token.repository";
import { Transaction } from "./database";
import { passwordResetTokens, users } from "./schema";

// eslint-disable-next-line turbo/no-undeclared-env-vars -- opt-in local DB probe
const RUN_DB_PROBE = process.env.RUN_DB_PROBE === "1";

describe.skipIf(!RUN_DB_PROBE)(
  "password-reset SQL against local Postgres",
  () => {
    let pool: Pool;
    let transaction: Transaction;
    let accounts: AccountRepository;
    let tokens: DrizzlePasswordResetTokenRepository;
    const createdUserIds: string[] = [];

    beforeAll(async () => {
      pool = new Pool({
        connectionString:
          // eslint-disable-next-line turbo/no-undeclared-env-vars -- opt-in local DB probe
          process.env.DATABASE_URL ??
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      });
      const db = drizzle(pool, {
        schema: { users, passwordResetTokens },
      });
      transaction = db as unknown as Transaction;
      accounts = new DrizzleAccountRepository(transaction);
      tokens = new DrizzlePasswordResetTokenRepository(transaction);
    });

    afterAll(async () => {
      for (const userId of createdUserIds) {
        await transaction
          .delete(passwordResetTokens)
          .where(eq(passwordResetTokens.userId, userId));
        await transaction.delete(users).where(eq(users.id, userId));
      }
      await pool.end();
    });

    async function seedUser(): Promise<string> {
      const userId = randomUUID();
      createdUserIds.push(userId);
      await transaction.insert(users).values({
        id: userId,
        firstName: "Ada",
        lastName: "Lovelace",
        email: `${userId}@example.com`,
        passwordHash: "hash",
        status: "active",
        sessionVersion: 0,
      });
      return userId;
    }

    function tokenInput(
      userId: string,
      createdAt: Date,
    ): PasswordResetTokenInput {
      return {
        id: randomUUID(),
        userId,
        tokenHash: randomUUID(),
        expiresAt: new Date(createdAt.getTime() + 60 * 60 * 1000),
        createdAt,
      };
    }

    it("finds the newest unconsumed token, invalidates it and removes rows by id", async () => {
      const userId = await seedUser();
      const older = tokenInput(userId, new Date(Date.now() - 120_000));
      await tokens.create(older);

      const first = await tokens.findNewestUnconsumedByUserId(userId);
      expect(first).not.toBeNull();
      expect(
        Math.abs(first!.createdAt.getTime() - older.createdAt.getTime()),
      ).toBeLessThan(1000);

      await tokens.invalidateUnconsumedByUserId(userId, new Date());
      expect(await tokens.findNewestUnconsumedByUserId(userId)).toBeNull();

      const newer = tokenInput(userId, new Date(Date.now() - 10_000));
      await tokens.create(newer);
      const newest = await tokens.findNewestUnconsumedByUserId(userId);
      expect(newest).not.toBeNull();
      expect(
        Math.abs(newest!.createdAt.getTime() - newer.createdAt.getTime()),
      ).toBeLessThan(1000);

      await tokens.invalidateUnconsumedByUserId(userId, new Date());
      expect(await tokens.findNewestUnconsumedByUserId(userId)).toBeNull();

      const rows = await transaction
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, userId));
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.usedAt !== null)).toBe(true);

      await tokens.create(tokenInput(userId, new Date()));
      const remaining = await transaction
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, userId),
            isNull(passwordResetTokens.usedAt),
          ),
        );
      expect(remaining).toHaveLength(1);
      await tokens.removeById(remaining[0]!.id);
      expect(await tokens.findNewestUnconsumedByUserId(userId)).toBeNull();
    });

    it("enforces one unconsumed token per account and locks the account by email", async () => {
      const userId = await seedUser();
      const first = tokenInput(userId, new Date());
      await tokens.create(first);

      await expect(
        tokens.create(tokenInput(userId, new Date())),
      ).rejects.toThrow();

      const seeded = await accounts.findById(userId);
      const account = await accounts.findByEmailForUpdate(
        seeded!.email.toUpperCase(),
      );
      expect(account?.id).toBe(userId);
      expect(
        await accounts.findByEmailForUpdate("nobody@example.com"),
      ).toBeNull();
    });

    it("claims an unconsumed unexpired token once and releases it conditionally", async () => {
      const userId = await seedUser();
      const now = new Date();
      const tokenHash = randomUUID();
      await tokens.create({ ...tokenInput(userId, now), tokenHash });

      expect(await tokens.claimByHash(randomUUID(), now)).toBeNull();
      const claim = await tokens.claimByHash(tokenHash, now);
      expect(claim?.userId).toBe(userId);
      expect(await tokens.claimByHash(tokenHash, now)).toBeNull();

      await tokens.releaseClaim(tokenHash, claim!.usedAt);
      expect((await tokens.claimByHash(tokenHash, now))?.userId).toBe(userId);
      await tokens.claimByHash(tokenHash, now);

      const expiredHash = randomUUID();
      await tokens.create({
        ...tokenInput(userId, new Date(now.getTime() - 2 * 60 * 60 * 1000)),
        tokenHash: expiredHash,
      });
      expect(await tokens.claimByHash(expiredHash, now)).toBeNull();
    });

    it("guards password/version writes and restores them conditionally", async () => {
      const userId = await seedUser();
      expect((await accounts.findById(userId))?.sessionVersion).toBe(0);
      expect(
        await accounts.setPasswordAndIncrementVersionIfVersion(
          userId,
          "new-hash",
          1,
          2,
        ),
      ).toBeNull();

      expect(
        await accounts.setPasswordAndIncrementVersionIfVersion(
          userId,
          "new-hash",
          0,
          1,
        ),
      ).toBe(1);
      expect((await accounts.findById(userId))?.passwordHash).toBe("new-hash");

      await accounts.restorePasswordAndVersion(userId, "old-hash", 1);
      const restored = await accounts.findById(userId);
      expect(restored?.passwordHash).toBe("old-hash");
      expect(restored?.sessionVersion).toBe(0);

      await accounts.setPasswordAndIncrementVersionIfVersion(
        userId,
        "newer-hash",
        0,
        1,
      );
      await accounts.restorePasswordAndVersion(userId, "old-hash", 0);
      expect((await accounts.findById(userId))?.passwordHash).toBe(
        "newer-hash",
      );
    });
  },
);
