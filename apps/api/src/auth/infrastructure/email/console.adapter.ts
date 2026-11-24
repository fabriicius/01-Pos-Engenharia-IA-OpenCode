import { Injectable } from "@nestjs/common";
import { EmailMessage, EmailService } from "../../domain/email";

export const CONSOLE_FALLBACK_WARNING =
  "[EmailService] No email provider credentials found. Falling back to console output.";

@Injectable()
export class ConsoleEmailAdapter extends EmailService {
  async send(message: EmailMessage): Promise<void> {
    console.warn(CONSOLE_FALLBACK_WARNING);
    console.log(
      [
        "",
        `--- ${message.subject} ---`,
        `To: ${message.to}`,
        "",
        message.text,
        "--- end of message ---",
        "",
      ].join("\n"),
    );
  }
}
