"use client";

import { Toaster } from "sonner";
import { useMediaQuery } from "@/hooks/use-media-query";

type ToastTheme = "storefront" | "controlPlane";

export function ToastProvider({
  theme = "storefront",
  desktopPosition = "top-right"
}: {
  theme?: ToastTheme;
  desktopPosition?: "top-right" | "top-center";
}) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const position = isMobile ? "bottom-center" : desktopPosition;

  const toastOptions =
    theme === "controlPlane"
      ? {
          className: "border-white/10 bg-[#080b0d] text-white",
          duration: 3800
        }
      : {
          className:
            "border-[color:var(--ds-border-strong)] bg-[color:var(--ds-card)] text-[color:var(--ds-ink)] shadow-[0_12px_36px_rgba(0,0,0,0.10)]",
          duration: 3800
        };

  return (
    <Toaster
      position={position}
      richColors
      closeButton
      visibleToasts={4}
      expand={false}
      style={{ zIndex: "var(--z-toast)" }}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast: prefersReducedMotion ? "transition-none" : undefined,
          closeButton: "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        }
      }}
    />
  );
}
