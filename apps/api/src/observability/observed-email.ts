import { EmailMessage, EmailService } from "../auth/domain/email";
import { ObservabilityService } from "./observability.service";

const TYPES: Record<string, string> = {
  "Confirm your account": "confirmation",
  "A new session was created": "session",
  "Reset your password": "password-reset",
  "Your password has been reset": "password-reset-confirmation",
};

export class ObservedEmailService extends EmailService {
  constructor(
    private readonly adapter: EmailService,
    private readonly provider: "mailtrap" | "resend" | "console",
    private readonly telemetry: ObservabilityService,
  ) {
    super();
    telemetry.emailProvider.set({ provider }, 1);
    for (const operation of [...Object.values(TYPES), "other"]) {
      for (const outcome of provider === "console"
        ? ["console", "failed"]
        : ["accepted", "failed"])
        telemetry.emails.inc({ provider, operation, outcome }, 0);
    }
  }

  async send(message: EmailMessage): Promise<void> {
    const operation = TYPES[message.subject] ?? "other";
    const start = performance.now();
    let outcome = this.provider === "console" ? "console" : "accepted";
    try {
      await this.telemetry.operation(
        "email.dispatch",
        { provider: this.provider, operation, outcome },
        () => this.adapter.send(message),
      );
    } catch (error) {
      outcome = "failed";
      throw error;
    } finally {
      this.telemetry.emails.inc({
        provider: this.provider,
        operation,
        outcome,
      });
      this.telemetry.emailDuration.observe(
        { provider: this.provider, operation },
        (performance.now() - start) / 1000,
      );
    }
  }
}
