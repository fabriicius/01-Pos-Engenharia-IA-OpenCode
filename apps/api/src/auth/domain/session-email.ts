export function sessionEmailText(appUrl: string, now: Date): string {
  return [
    "Hello,",
    "",
    `A new session was created for your account at ${now.toISOString()} (UTC).`,
    `You can review your account at ${appUrl.replace(/\/$/, "")}/app/home.`,
    "",
    "If this wasn't you, change your password.",
  ].join("\n");
}
