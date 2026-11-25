export function passwordResetEmailText(appUrl: string, token: string): string {
  const link = `${appUrl.replace(/\/$/, "")}/auth/reset-password?token=${token}`;

  return [
    "Hello,",
    "",
    "Reset your password using the link below:",
    link,
    "",
    "This link expires in one hour.",
    "",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");
}
