import { Injectable } from "@nestjs/common";
import { AccessTokenService } from "../domain/access-token";
import { InvalidAccessTokenError } from "../domain/errors";
import { UnitOfWork } from "../domain/ports";

export interface CurrentSession {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

@Injectable()
export class GetCurrentSessionUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async execute(token: string | null): Promise<CurrentSession> {
    if (token === null) {
      throw new InvalidAccessTokenError();
    }

    const claims = this.accessTokens.verify(token);
    if (claims === null) {
      throw new InvalidAccessTokenError();
    }

    const account = await this.unitOfWork.run((repositories) =>
      repositories.accounts.findById(claims.sub),
    );

    if (account === null || account.sessionVersion !== claims.ver) {
      throw new InvalidAccessTokenError();
    }

    return {
      id: account.id,
      firstName: account.firstName,
      lastName: account.lastName,
      email: account.email,
    };
  }
}
