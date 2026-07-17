"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from "./store-back-button.module.css";

const PRODUCTS_FALLBACK = "/products";

type StoreBackButtonProps = {
  fallbackHref?: string;
  className?: string;
  /** When true, omit the outer content-container row (parent already provides alignment). */
  embedded?: boolean;
  /**
   * Clear the absolute/sticky storefront navbar on flush-under-nav pages
   * (category showcase heroes) so the control sits below the nav, above content.
   */
  flushUnderNav?: boolean;
  label?: string;
};

function canSafelyGoBack() {
  if (typeof window === "undefined") return false;

  const referrer = document.referrer;
  if (referrer) {
    try {
      if (new URL(referrer).origin === window.location.origin) return true;
    } catch {
      /* ignore invalid referrer */
    }
  }

  return window.history.length > 1;
}

export function StoreBackButton({
  fallbackHref = PRODUCTS_FALLBACK,
  className,
  embedded = false,
  flushUnderNav = false,
  label = "Back"
}: StoreBackButtonProps) {
  const router = useRouter();

  function handleBack() {
    if (canSafelyGoBack()) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }

  const control = (
    <Button
      type="button"
      variant="outline"
      onClick={handleBack}
      className={cn(styles.button, className)}
      aria-label={label === "Back" ? "Go back" : label}
    >
      <span className={styles.iconWrap} aria-hidden="true">
        <ArrowLeft className={styles.icon} strokeWidth={2} />
      </span>
      <span className={styles.label}>{label}</span>
    </Button>
  );

  if (embedded) {
    return <div className={styles.rowEmbedded}>{control}</div>;
  }

  return (
    <div className={flushUnderNav ? styles.rowFlush : styles.row}>
      {control}
    </div>
  );
}
