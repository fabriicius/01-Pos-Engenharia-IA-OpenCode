import { ConfigService } from "@nestjs/config";
import { EmailService } from "../../domain/email";
import { ConsoleEmailAdapter } from "./console.adapter";
import {
  MAILTRAP_CREDENTIAL_KEYS,
  MailtrapSmtpEmailAdapter,
} from "./mailtrap-smtp.adapter";
import { ResendApiEmailAdapter } from "./resend-api.adapter";

export type EmailProvider = "mailtrap" | "resend";

export function selectEmailProvider(config: ConfigService): EmailProvider {
  const configured = config.get<string>("EMAIL_PROVIDER");

  if (configured === "mailtrap" || configured === "resend") {
    return configured;
  }

  return config.get<string>("NODE_ENV") === "production"
    ? "resend"
    : "mailtrap";
}

export function createEmailService(config: ConfigService): EmailService {
  const provider = selectEmailProvider(config);
  const hasCredentials =
    provider === "mailtrap"
      ? MAILTRAP_CREDENTIAL_KEYS.every((key) =>
          Boolean(config.get<string>(key)),
        )
      : Boolean(config.get<string>("RESEND_API_KEY")) &&
        Boolean(config.get<string>("RESEND_FROM"));

  if (!hasCredentials) {
    return new ConsoleEmailAdapter();
  }

  return provider === "mailtrap"
    ? new MailtrapSmtpEmailAdapter(config)
    : new ResendApiEmailAdapter(config);
}
