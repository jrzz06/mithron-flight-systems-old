const GENERIC_SIGN_IN_ERROR = "Sign-in failed. Please try again.";
const INVALID_CREDENTIALS = "Invalid email or password.";
const ACCOUNT_NOT_FOUND = "Account not found.";
const VERIFICATION_FAILED = "Verification failed. Please try again.";
const TOO_MANY_ATTEMPTS = "Too many attempts. Please try again later.";
const ACCOUNT_DISABLED = "This account has been disabled. Contact support.";
const ROLE_UNAVAILABLE = "Your account is not fully set up yet. Contact support.";
const SESSION_CANCELLED = "Sign-in was cancelled.";
const NETWORK_ERROR = "Connection error. Please try again.";
const OAUTH_CODE_MESSAGES: Record<string, string> = {
  "auth/popup-closed-by-user": SESSION_CANCELLED,
  "auth/cancelled-popup-request": SESSION_CANCELLED,
  "auth/unauthorized-domain": "Google sign-in isn't available right now. Please use email sign-in or try again later.",
  "auth/operation-not-supported-in-this-environment": "Opening Google sign-in…"
};

function extractOAuthAuthCode(message: string) {
  const match = message.match(/auth\/[a-z0-9-]+/i);
  return match?.[0]?.toLowerCase() ?? null;
}

function normalizeMessage(error: unknown) {
  if (typeof error === "string") return error.trim();
  if (error instanceof Error) return error.message.trim();
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message.trim();
  }
  return "";
}

export function mapAuthErrorForClient(error: unknown, fallback = GENERIC_SIGN_IN_ERROR) {
  const message = normalizeMessage(error);
  if (!message) return fallback;

  const lower = message.toLowerCase();
  const oauthCode = extractOAuthAuthCode(lower);
  if (oauthCode && OAUTH_CODE_MESSAGES[oauthCode]) {
    return OAUTH_CODE_MESSAGES[oauthCode];
  }

  if (lower.includes("too many") || lower.includes("rate limit") || lower.includes("rate_limit") || lower.includes("locked")) {
    return TOO_MANY_ATTEMPTS;
  }
  if (lower.includes("email not confirmed") || lower.includes("email_not_confirmed")) {
    return "Please verify your email before signing in.";
  }
  if (lower.includes("invalid login credentials") || lower.includes("invalid email or password")) {
    return INVALID_CREDENTIALS;
  }
  if (lower.includes("user not found") || lower.includes("account not found")) {
    return ACCOUNT_NOT_FOUND;
  }
  if (
    lower.includes("invalid verification")
    || lower.includes("invalid code")
    || lower.includes("code expired")
    || lower.includes("session expired")
  ) {
    return VERIFICATION_FAILED;
  }
  if (lower.includes("disabled")) {
    return ACCOUNT_DISABLED;
  }
  if (lower.includes("role") && lower.includes("could not")) {
    return ROLE_UNAVAILABLE;
  }
  if (lower.includes("popup-closed") || lower.includes("cancelled") || lower.includes("canceled")) {
    return SESSION_CANCELLED;
  }
  if (lower.includes("network") || lower.includes("fetch failed") || lower.includes("failed to fetch")) {
    return NETWORK_ERROR;
  }
  if (
    lower.includes("unexpected status code returned from hook")
    || lower.includes("error sending confirmation email")
    || (lower.includes("hook") && (lower.includes("403") || lower.includes("401") || lower.includes("503")))
    || lower.includes("email delivery is temporarily unavailable")
  ) {
    return "Email delivery is temporarily unavailable. Please try again later.";
  }
  if (lower.includes("email_exists") || lower.includes("already been registered")) {
    return "This email is already linked to an account. Sign in with email or contact support.";
  }
  if (
    lower.includes("supabase")
    || lower.includes("token")
    || lower.includes("oauth")
    || lower.includes("configured")
    || lower.includes("provision")
    || lower.includes("internal")
  ) {
    return fallback;
  }

  if (message.length > 120 || message.includes("Error:") || message.includes(" at ")) {
    return fallback;
  }

  return message;
}

export function mapAuthPageNotice(input: {
  auth_error?: string | null;
  auth_status?: string | null;
  logout_status?: string | null;
  logout_reason?: string | null;
  logout_notice?: string | null;
  admin_status?: string | null;
  access_status?: string | null;
}) {
  if (input.auth_error) {
    const mapped = mapAuthErrorForClient(input.auth_error);
    if (input.auth_error === "verification_failed") {
      return { tone: "error" as const, message: VERIFICATION_FAILED };
    }
    if (input.auth_error === "session_missing") {
      return { tone: "error" as const, message: GENERIC_SIGN_IN_ERROR };
    }
    return { tone: "error" as const, message: mapped };
  }
  if (input.logout_status === "signed_out") {
    return { tone: "neutral" as const, message: "You have been signed out." };
  }
  if (input.logout_notice) {
    return { tone: "neutral" as const, message: "Use the sign out button to end your session." };
  }
  if (input.logout_reason === "session_idle") {
    return { tone: "neutral" as const, message: "Your sign-in ended. Please sign in again." };
  }
  if (input.logout_reason === "session_revoked") {
    return { tone: "neutral" as const, message: "Your session was revoked. Please sign in again." };
  }
  if (input.logout_reason === "disabled") {
    return { tone: "error" as const, message: ACCOUNT_DISABLED };
  }
  if (input.auth_status === "role_required") {
    return { tone: "neutral" as const, message: ROLE_UNAVAILABLE };
  }
  if (input.auth_status === "provisioning_failed") {
    return { tone: "error" as const, message: "We could not finish setting up your account. Please try signing in again." };
  }
  if (input.auth_status === "role_resolution_failed") {
    return { tone: "error" as const, message: "We could not verify your account permissions. Please try again." };
  }
  if (input.auth_status === "service_unavailable") {
    return { tone: "error" as const, message: "Sign-in is temporarily unavailable. Please try again shortly." };
  }
  if (input.admin_status === "forbidden" || input.access_status === "forbidden") {
    return { tone: "neutral" as const, message: "You do not have permission to open that page." };
  }
  return null;
}

const authClientMessages = {
  GENERIC_SIGN_IN_ERROR,
  INVALID_CREDENTIALS,
  ACCOUNT_NOT_FOUND,
  VERIFICATION_FAILED,
  TOO_MANY_ATTEMPTS,
  ACCOUNT_DISABLED,
  ROLE_UNAVAILABLE,
  SESSION_CANCELLED,
  NETWORK_ERROR
};
