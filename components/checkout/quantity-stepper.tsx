"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_QUANTITY = 99;

type QuantityStepperProps = {
  value: number;
  onChange: (next: number) => void;
  label: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
};

export function QuantityStepper({
  value,
  onChange,
  label,
  disabled = false,
  loading = false,
  className
}: QuantityStepperProps) {
  const isDisabled = disabled || loading;
  const canDecrease = value > 1;
  const canIncrease = value < MAX_QUANTITY;

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-xl border border-slate-200 bg-white shadow-sm",
        isDisabled && "opacity-60",
        className
      )}
      role="group"
      aria-label={`Quantity for ${label}`}
    >
      <button
        type="button"
        aria-label={`Decrease quantity for ${label}`}
        disabled={isDisabled || !canDecrease}
        className="flex size-11 items-center justify-center rounded-l-xl text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f6b46] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-slate-300"
        onClick={() => onChange(value - 1)}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span
        className="min-w-11 px-2 text-center text-sm font-semibold tabular-nums text-slate-900"
        aria-live="polite"
        aria-atomic="true"
      >
        {loading ? "…" : value}
      </span>
      <button
        type="button"
        aria-label={`Increase quantity for ${label}`}
        disabled={isDisabled || !canIncrease}
        className="flex size-11 items-center justify-center rounded-r-xl text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f6b46] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-slate-300"
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
