import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  CurrentSession,
  GetCurrentSessionUseCase,
} from "../application/get-current-session.use-case";

export interface BearerRequest {
  headers: { authorization?: string };
  currentSession?: CurrentSession;
}

const BEARER_PREFIX = "Bearer ";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly getCurrentSession: GetCurrentSessionUseCase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BearerRequest>();
    const header = request.headers.authorization;
    const token =
      header?.startsWith(BEARER_PREFIX) === true
        ? header.slice(BEARER_PREFIX.length)
        : null;

    try {
      request.currentSession = await this.getCurrentSession.execute(token);
      return true;
    } catch {
      throw new UnauthorizedException(
        "Unable to authenticate with the provided token.",
      );
    }
  }
}
