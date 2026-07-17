import type { CSSProperties } from "react";
import type { NavbarInkTone } from "@/lib/navbar-ink-sampling";

export const NAVBAR_INK_STYLE_VARS = {
  light: {
    "--adaptive-navbar-ink": "rgba(252, 253, 255, 0.98)",
    "--adaptive-navbar-hover": "rgba(255, 255, 255, 1)",
    "--adaptive-navbar-muted": "rgba(248, 250, 252, 0.72)",
    "--adaptive-navbar-underline": "rgba(255, 255, 255, 0.84)",
    "--adaptive-navbar-text-shadow": "none",
    "--adaptive-navbar-glass-start": "rgba(7, 10, 13, 0.62)",
    "--adaptive-navbar-glass-end": "rgba(7, 10, 13, 0.34)",
    "--adaptive-navbar-border": "rgba(255, 255, 255, 0.14)",
    "--adaptive-navbar-shadow": "0 10px 28px rgba(0, 0, 0, 0.18)",
    "--adaptive-navbar-menu-bg": "rgba(8, 10, 12, 0.72)",
    "--adaptive-navbar-menu-border": "rgba(255, 255, 255, 0.16)",
    "--adaptive-navbar-menu-control": "rgba(255, 255, 255, 0.07)"
  },
  dark: {
    "--adaptive-navbar-ink": "rgba(10, 12, 16, 0.97)",
    "--adaptive-navbar-hover": "rgba(10, 12, 16, 0.82)",
    "--adaptive-navbar-muted": "rgba(10, 12, 16, 0.62)",
    "--adaptive-navbar-underline": "rgba(10, 12, 16, 0.72)",
    "--adaptive-navbar-text-shadow": "none",
    "--adaptive-navbar-glass-start": "rgba(255, 255, 255, 0.9)",
    "--adaptive-navbar-glass-end": "rgba(255, 255, 255, 0.74)",
    "--adaptive-navbar-border": "rgba(17, 17, 19, 0.1)",
    "--adaptive-navbar-shadow": "0 10px 24px rgba(15, 23, 42, 0.08)",
    "--adaptive-navbar-menu-bg": "rgba(250, 252, 253, 0.76)",
    "--adaptive-navbar-menu-border": "rgba(17, 17, 19, 0.10)",
    "--adaptive-navbar-menu-control": "rgba(17, 17, 19, 0.055)"
  }
} satisfies Record<NavbarInkTone, CSSProperties & Record<`--${string}`, string>>;
