import { and, desc, eq, gt, isNull } from "drizzle-orm";
import {
  LatestPasswordResetToken,
  PasswordResetTokenInput,
  PasswordResetTokenRepository,
  TokenClaim,
} from "../domain/ports";
import { Transaction } from "./database";
import { passwordResetTokens } from "./schema";

export class DrizzlePasswordResetTokenRepository extends PasswordResetTokenRepository {
  constructor(private readonly transaction: Transaction) {
    super();
  }

  async create(input: PasswordResetTokenInput): Promise<void> {
    await this.transaction.insert(passwordResetTokens).values({
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: input.createdAt,
    });
  }

  async findNewestUnconsumedByUserId(
    userId: string,
  ): Promise<LatestPasswordResetToken | null> {
    const rows = await this.transaction
      .select({ createdAt: passwordResetTokens.createdAt })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          isNull(passwordResetTokens.usedAt),
        ),
      )
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(1);

    return rows[0] ?? null;
  }

  async invalidateUnconsumedByUserId(userId: string, now: Date): Promise<void> {
    await this.transaction
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          isNull(passwordResetTokens.usedAt),
        ),
      );
  }

  async removeById(id: string): Promise<void> {
    await this.transaction
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.id, id));
  }

  async claimByHash(tokenHash: string, now: Date): Promise<TokenClaim | null> {
    const rows = await this.transaction
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .returning({
        userId: passwordResetTokens.userId,
        usedAt: passwordResetTokens.usedAt,
      });

    const row = rows[0];
    if (row === undefined || row.usedAt === null) {
      return null;
    }

    return { userId: row.userId, usedAt: row.usedAt };
  }

  async releaseClaim(tokenHash: string, claimedUsedAt: Date): Promise<void> {
    await this.transaction
      .update(passwordResetTokens)
      .set({ usedAt: null })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          eq(passwordResetTokens.usedAt, claimedUsedAt),
        ),
      );
  }
}
