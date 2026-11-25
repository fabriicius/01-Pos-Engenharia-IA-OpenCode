import { and, eq, gt, isNull } from "drizzle-orm";
import {
  ConfirmationTokenInput,
  ConfirmationTokenRepository,
  TokenClaim,
} from "../domain/ports";
import { Transaction } from "./database";
import { accountConfirmationTokens } from "./schema";

export class DrizzleConfirmationTokenRepository extends ConfirmationTokenRepository {
  constructor(private readonly transaction: Transaction) {
    super();
  }

  async create(input: ConfirmationTokenInput): Promise<void> {
    await this.transaction.insert(accountConfirmationTokens).values({
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: input.usedAt,
      createdAt: input.createdAt,
    });
  }

  async removeByUserId(userId: string): Promise<void> {
    await this.transaction
      .delete(accountConfirmationTokens)
      .where(eq(accountConfirmationTokens.userId, userId));
  }

  async claimByHash(tokenHash: string, now: Date): Promise<TokenClaim | null> {
    const rows = await this.transaction
      .update(accountConfirmationTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(accountConfirmationTokens.tokenHash, tokenHash),
          isNull(accountConfirmationTokens.usedAt),
          gt(accountConfirmationTokens.expiresAt, now),
        ),
      )
      .returning({
        userId: accountConfirmationTokens.userId,
        usedAt: accountConfirmationTokens.usedAt,
      });

    const row = rows[0];
    if (row === undefined || row.usedAt === null) {
      return null;
    }

    return { userId: row.userId, usedAt: row.usedAt };
  }

  async releaseClaim(tokenHash: string, claimedUsedAt: Date): Promise<void> {
    await this.transaction
      .update(accountConfirmationTokens)
      .set({ usedAt: null })
      .where(
        and(
          eq(accountConfirmationTokens.tokenHash, tokenHash),
          eq(accountConfirmationTokens.usedAt, claimedUsedAt),
        ),
      );
  }
}
