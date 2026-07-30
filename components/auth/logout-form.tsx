"use client";

import { useState, type AriaRole, type FormEvent } from "react";
import { LogOut } from "lucide-react";
import { clearBrowserAuthSession } from "@/lib/auth/clear-browser-session";
import { shellFocusRing } from "@/lib/ui/focus-classes";

type LogoutFormProps = {
  className?: string;
  buttonClassName?: string;
  buttonRole?: AriaRole;
  showIcon?: boolean;
  iconOnly?: boolean;
  label?: string;
  action?: string;
  onLogoutClick?: () => void;
};

function resolveLogoutLandingUrl(action: string) {
  try {
    const url = new URL(action, window.location.origin);
    const reason = url.searchParams.get("reason");
    const landing = new URL("/", window.location.origin);
    landing.searchParams.set("logout_status", "signed_out");
    if (reason) {
      landing.searchParams.set("logout_reason", reason);
    }
    return `${landing.pathname}${landing.search}`;
  } catch {
    return "/?logout_status=signed_out";
  }
}

export function LogoutForm({
  className,
  buttonClassName,
  buttonRole,
  showIcon = false,
  iconOnly = false,
  label = "Logout",
  action = "/auth/logout",
  onLogoutClick
}: LogoutFormProps) {
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    onLogoutClick?.();

    const form = event.currentTarget;
    const logoutAction = form.action || action;

    try {
      await fetch(logoutAction, {
        method: "POST",
        credentials: "same-origin",
        redirect: "manual"
      });
    } catch {
      // Continue with local clear + landing even if the network request fails.
    }

    await clearBrowserAuthSession();
    window.location.assign(resolveLogoutLandingUrl(logoutAction));
  }

  return (
    <form action={action} method="post" className={className} onSubmit={handleSubmit}>
      <button
        type="submit"
        role={buttonRole}
        aria-label={label}
        disabled={pending}
        className={
          buttonClassName
          ?? `inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-800 bg-[#10151d] px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-[#151c26] hover:text-slate-100 disabled:opacity-60 ${shellFocusRing}`
        }
      >
        {showIcon || iconOnly ? <LogOut className="h-4 w-4" aria-hidden="true" /> : null}
        {iconOnly ? null : label}
      </button>
    </form>
  );
}
