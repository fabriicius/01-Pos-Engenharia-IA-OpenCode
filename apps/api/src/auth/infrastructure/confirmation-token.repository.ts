import { eq } from "drizzle-orm";
import {
  ConfirmationTokenInput,
  ConfirmationTokenRepository,
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
}
