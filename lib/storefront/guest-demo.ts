type EnvSource = Record<string, string | undefined>;

/** Hide account/login UI for public customer demos (browse + guest checkout only). */
export function isStorefrontGuestOnly(env: EnvSource = process.env) {
  return env.NEXT_PUBLIC_STOREFRONT_GUEST_ONLY === "true";
}
