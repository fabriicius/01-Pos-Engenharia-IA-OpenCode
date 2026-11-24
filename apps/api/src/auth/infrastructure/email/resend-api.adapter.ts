import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EmailMessage, EmailService } from "../../domain/email";

export const RESEND_API_URL = "https://api.resend.com/emails";

@Injectable()
export class ResendApiEmailAdapter extends EmailService {
  private readonly apiKey: string;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    super();

    this.apiKey = this.required("RESEND_API_KEY");
    this.from = this.required("RESEND_FROM");
  }

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend API returned status ${response.status}`);
    }
  }

  private required(key: string): string {
    const value = this.config.get<string>(key);

    if (!value) {
      throw new Error(`Missing email configuration: ${key}`);
    }

    return value;
  }
}
