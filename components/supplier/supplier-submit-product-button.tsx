"use client";

import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";

type SupplierSubmitProductButtonProps = {
  label?: string;
  className?: string;
  variant?: "link" | "button";
};

export function SupplierSubmitProductButton({
  label = "Send for review",
  className,
  variant = "link"
}: SupplierSubmitProductButtonProps) {
  const resolvedClassName =
    className ??
    (variant === "button"
      ? "platform-btn-primary mt-4 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
      : "text-emerald-300 hover:underline");

  return (
    <OperationalSubmitButton
      confirmMessage="Send this product to our team for review?"
      pendingLabel="Sending for review"
      className={resolvedClassName}
    >
      {label}
    </OperationalSubmitButton>
  );
}
