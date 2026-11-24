import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, Transporter } from "nodemailer";
import { EmailMessage, EmailService } from "../../domain/email";

export const MAILTRAP_CREDENTIAL_KEYS = [
  "MAILTRAP_HOST",
  "MAILTRAP_USER",
  "MAILTRAP_PASSWORD",
  "MAILTRAP_FROM",
] as const;

@Injectable()
export class MailtrapSmtpEmailAdapter extends EmailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    super();

    this.from = this.required("MAILTRAP_FROM");
    this.transporter = createTransport({
      host: this.required("MAILTRAP_HOST"),
      port: Number(this.config.get<string>("MAILTRAP_PORT") ?? "2525"),
      auth: {
        user: this.required("MAILTRAP_USER"),
        pass: this.required("MAILTRAP_PASSWORD"),
      },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }

  private required(key: string): string {
    const value = this.config.get<string>(key);

    if (!value) {
      throw new Error(`Missing email configuration: ${key}`);
    }

    return value;
  }
}
