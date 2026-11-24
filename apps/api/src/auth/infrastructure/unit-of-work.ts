import { Injectable } from "@nestjs/common";
import { PersistencePorts, UnitOfWork } from "../domain/ports";
import { DrizzleAccountRepository } from "./account.repository";
import { DrizzleConfirmationTokenRepository } from "./confirmation-token.repository";
import { DatabaseClient } from "./database";

@Injectable()
export class DrizzleUnitOfWork extends UnitOfWork {
  constructor(private readonly database: DatabaseClient) {
    super();
  }

  async run<T>(
    work: (repositories: PersistencePorts) => Promise<T>,
  ): Promise<T> {
    return this.database.db.transaction(async (transaction) =>
      work({
        accounts: new DrizzleAccountRepository(transaction),
        confirmationTokens: new DrizzleConfirmationTokenRepository(transaction),
      }),
    );
  }
}
