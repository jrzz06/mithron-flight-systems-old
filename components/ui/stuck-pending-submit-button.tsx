"use client";

import { Button, type ButtonProps } from "@/components/ui/button";

type StuckPendingSubmitButtonProps = Omit<ButtonProps, "children" | "disabled" | "type" | "onClick"> & {
  pending: boolean;
  idleLabel: React.ReactNode;
  pendingLabel?: React.ReactNode;
  /** Stable analytics id kept for call-site compatibility; no longer drives a reload guard. */
  guardId?: string;
};

/**
 * Account/storefront submit button that reflects an external `pending` flag
 * (e.g. useActionState). Pending is guaranteed to clear by wrapServerAction
 * timeouts at the action call site — no hard-reload recovery needed.
 */
export function StuckPendingSubmitButton({
  pending,
  idleLabel,
  pendingLabel = "Saving...",
  guardId: _guardId,
  ...buttonProps
}: StuckPendingSubmitButtonProps) {
  void _guardId;

  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...buttonProps}>
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
