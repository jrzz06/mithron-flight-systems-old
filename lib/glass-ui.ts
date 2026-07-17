import { cn } from "@/lib/utils";

export const glassUiClasses = {
  button: "glass-button",
  buttonCart: "glass-button glass-button--cart",
  pill: "glass-pill",
  badge: "glass-badge",
  chip: "glass-chip"
} as const;

export function glassButtonClassName(options?: { cart?: boolean; className?: string }) {
  return cn(options?.cart ? glassUiClasses.buttonCart : glassUiClasses.button, options?.className);
}

export function glassPillClassName(className?: string) {
  return cn(glassUiClasses.pill, className);
}

function glassBadgeClassName(className?: string) {
  return cn(glassUiClasses.badge, className);
}

function glassChipClassName(className?: string) {
  return cn(glassUiClasses.chip, className);
}
