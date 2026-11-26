export class DuplicateEmailError extends Error {
  constructor() {
    super("Email address already in use.");
    this.name = "DuplicateEmailError";
  }
}

export class EmailDispatchError extends Error {
  constructor() {
    super("Confirmation email could not be delivered.");
    this.name = "EmailDispatchError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Unable to sign in with the provided credentials.");
    this.name = "InvalidCredentialsError";
  }
}

export class AccountNotConfirmedError extends Error {
  constructor() {
    super("Please confirm your account before signing in.");
    this.name = "AccountNotConfirmedError";
  }
}

export class InvalidAccessTokenError extends Error {
  constructor() {
    super("Unable to authenticate with the provided token.");
    this.name = "InvalidAccessTokenError";
  }
}

export class InvalidConfirmationTokenError extends Error {
  constructor() {
    super("This confirmation link is invalid or has expired.");
    this.name = "InvalidConfirmationTokenError";
  }
}

export class SessionNotificationError extends Error {
  constructor() {
    super("Session notification email could not be delivered.");
    this.name = "SessionNotificationError";
  }
}

export class InvalidPasswordResetTokenError extends Error {
  constructor() {
    super("This password reset link is invalid or has expired.");
    this.name = "InvalidPasswordResetTokenError";
  }
}

export class PasswordResetNotificationError extends Error {
  constructor() {
    super("Unable to reset your password. Please try again.");
    this.name = "PasswordResetNotificationError";
  }
}
