export type LoginHeroTier = "lite" | "standard" | "premium";

export function resolveLoginHeroTier(): LoginHeroTier {
  if (typeof window === "undefined") {
    return "lite";
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return "lite";
  }

  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;

  if (connection?.saveData) {
    return "lite";
  }

  if (connection?.effectiveType === "2g" || connection?.effectiveType === "slow-2g") {
    return "lite";
  }

  const cores = navigator.hardwareConcurrency;
  if (typeof cores === "number" && cores <= 2) {
    return "lite";
  }

  if (window.matchMedia("(max-width: 767px)").matches) {
    return "standard";
  }

  if (typeof cores === "number" && cores <= 4) {
    return "standard";
  }

  return "premium";
}
