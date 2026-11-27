import { Injectable } from "@nestjs/common";
import { PersistencePorts, UnitOfWork } from "../domain/ports";
import { DrizzleAccountRepository } from "./account.repository";
import { DrizzleConfirmationTokenRepository } from "./confirmation-token.repository";
import { ObservabilityService } from "../../observability/observability.service";
import { DatabaseClient } from "./database";
import { DrizzlePasswordResetTokenRepository } from "./password-reset-token.repository";

@Injectable()
export class DrizzleUnitOfWork extends UnitOfWork {
  constructor(
    private readonly database: DatabaseClient,
    private readonly telemetry: ObservabilityService,
  ) {
    super();
  }

  async run<T>(
    work: (repositories: PersistencePorts) => Promise<T>,
  ): Promise<T> {
    const start = performance.now();
    let outcome = "committed";
    try {
      return await this.telemetry.operation("database.transaction", {}, () =>
        this.database.db.transaction(async (transaction) =>
          work({
            accounts: new DrizzleAccountRepository(transaction),
            confirmationTokens: new DrizzleConfirmationTokenRepository(
              transaction,
            ),
            passwordResetTokens: new DrizzlePasswordResetTokenRepository(
              transaction,
            ),
          }),
        ),
      );
    } catch (error) {
      outcome = "rolled_back";
      throw error;
    } finally {
      this.telemetry.transactions.inc({ outcome });
      this.telemetry.transactionDuration.observe(
        { outcome },
        (performance.now() - start) / 1000,
      );
    }
  }
}
