export function resetConfirmationEmailText(now: Date): string {
  return [
    "Hello,",
    "",
    `Your password was reset at ${now.toISOString()} (UTC).`,
    "",
    "If this wasn't you, reset it again immediately.",
  ].join("\n");
}
