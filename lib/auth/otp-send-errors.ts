import { mapAuthErrorForClient } from "@/lib/auth/client-errors";

function normalizeOtpSendMessage(error: unknown) {
  if (typeof error === "string") return error.trim();
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message.trim();
  }
  return "";
}

/** Sign-in OTP must not reveal whether an account exists. */
export function shouldExposeSignInOtpSendError(error: unknown) {
  const message = normalizeOtpSendMessage(error).toLowerCase();
  if (!message) return false;

  return (
    message.includes("rate limit")
    || message.includes("rate_limit")
    || message.includes("too many")
    || message.includes("smtp")
    || message.includes("mail")
    || message.includes("timeout")
    || message.includes("network")
    || message.includes("internal")
    || message.includes("over_email_send_rate_limit")
    || message.includes("error sending")
    || message.includes("email provider")
    || message.includes("temporarily unavailable")
  );
}

export function mapOtpSendErrorForClient(error: unknown) {
  return mapAuthErrorForClient(error, "Unable to send verification code. Please try again later.");
}
