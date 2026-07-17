"use client";

import { LogOut } from "lucide-react";
import { shellFocusRing } from "@/lib/ui/focus-classes";

type LogoutFormProps = {
  className?: string;
  buttonClassName?: string;
  showIcon?: boolean;
  label?: string;
};

export function LogoutForm({
  className,
  buttonClassName,
  showIcon = false,
  label = "Logout"
}: LogoutFormProps) {
  return (
    <form action="/auth/logout" method="post" className={className}>
      <button
        type="submit"
        aria-label={label}
        className={
          buttonClassName
          ?? `inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-800 bg-[#10151d] px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-[#151c26] hover:text-slate-100 ${shellFocusRing}`
        }
      >
        {showIcon ? <LogOut className="h-4 w-4" aria-hidden="true" /> : null}
        {label}
      </button>
    </form>
  );
}
