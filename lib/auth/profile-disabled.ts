export class ProfileDisabledError extends Error {
  constructor(message = "This account has been disabled. Contact an administrator.") {
    super(message);
    this.name = "ProfileDisabledError";
  }
}
