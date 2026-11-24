import { eq } from "drizzle-orm";
import { DuplicateEmailError } from "../domain/errors";
import { AccountRepository, PendingAccountInput } from "../domain/ports";
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
}
