"use client";

import { Info } from "lucide-react";

export function ProductInfoTooltip({ label }: { label: string }) {
  return (
    <span className="group relative inline-flex">
      <Info className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+0.4rem)] left-1/2 z-20 hidden w-52 -translate-x-1/2 rounded-lg border border-slate-700 bg-[#0b1017] px-2.5 py-2 text-[11px] font-normal normal-case leading-4 tracking-normal text-slate-300 shadow-lg group-hover:block group-focus-within:block"
      >
        {label}
      </span>
    </span>
  );
}

export function ProductFieldLabel({
  children,
  tooltip
}: {
  children: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
      {children}
      {tooltip ? <ProductInfoTooltip label={tooltip} /> : null}
    </span>
  );
}
