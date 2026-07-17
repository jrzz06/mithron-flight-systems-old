import { getConfiguredEmailProviders } from "@/services/email/providers";
import { EMAIL_DELIVERY_UNAVAILABLE_MESSAGE } from "@/lib/api/customer-contact";

/** True when Supabase send-email hook and at least one outbound provider are configured. */
export function isAuthEmailDeliveryConfigured(
  env: Record<string, string | undefined> = process.env
) {
  const configured = getConfiguredEmailProviders(env);
  return Boolean(configured.hook && configured.any);
}

export function authEmailDeliveryUnavailableResponse() {
  return {
    error: EMAIL_DELIVERY_UNAVAILABLE_MESSAGE,
    code: "email_delivery_unavailable" as const
  };
}
