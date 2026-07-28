import { getConfiguredEmailProviders } from "@/services/email/providers";
import { EMAIL_DELIVERY_UNAVAILABLE_MESSAGE } from "@/lib/api/customer-contact";

function hasHostedSupabaseSmtp(env: Record<string, string | undefined>) {
  const hasLogin = Boolean(env.BREVO_SMTP_LOGIN?.trim());
  const hasPass = Boolean(env.BREVO_SMTP_KEY?.trim() || env.BREVO_API_KEY?.trim()?.startsWith("xsmtpsib-"));
  const hasFrom = Boolean(env.BREVO_FROM_EMAIL?.trim());
  // Host is optional for the readiness gate — sync tooling defaults it — but
  // prefer explicit host when present in env (documented Supabase SMTP path).
  return hasLogin && hasPass && hasFrom;
}

/**
 * True when auth emails can be delivered:
 * - custom send-email hook + at least one app provider, or
 * - hosted Supabase SMTP via Brevo credentials (hook may be off).
 */
export function isAuthEmailDeliveryConfigured(
  env: Record<string, string | undefined> = process.env
) {
  const configured = getConfiguredEmailProviders(env);
  if (configured.hook && configured.any) return true;
  return hasHostedSupabaseSmtp(env);
}

export function authEmailDeliveryUnavailableResponse() {
  return {
    error: EMAIL_DELIVERY_UNAVAILABLE_MESSAGE,
    code: "email_delivery_unavailable" as const
  };
}
