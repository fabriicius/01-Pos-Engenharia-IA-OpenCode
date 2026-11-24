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
