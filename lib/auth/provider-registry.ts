import { getSupabasePublicConfig, type EnvSource } from "@/lib/env";

export type AuthProviderAvailability = {
  google: boolean;
  email: boolean;
};

function isEnabled(env: EnvSource, key: string, defaultValue = true) {
  const value = env[key]?.trim().toLowerCase();
  if (!value) return defaultValue;
  return value === "true" || value === "1" || value === "yes";
}

export function getAuthProviderAvailability(env: EnvSource = process.env): AuthProviderAvailability {
  const supabaseReady = getSupabasePublicConfig(env).configured;

  return {
    google: supabaseReady && isEnabled(env, "AUTH_PROVIDER_GOOGLE_ENABLED", true),
    email: supabaseReady && isEnabled(env, "AUTH_PROVIDER_EMAIL_ENABLED", true)
  };
}

export function hasSocialSignIn(providers: AuthProviderAvailability) {
  return providers.google;
}
