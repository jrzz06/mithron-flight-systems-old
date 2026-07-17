"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { notify } from "@/lib/feedback/notify";

const LOGOUT_PARAMS = ["logout_status", "logout_reason"] as const;

export function LogoutNoticeToastBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastNoticeKey = useRef<string | null>(null);

  useEffect(() => {
    const logoutStatus = searchParams.get("logout_status");
    const logoutReason = searchParams.get("logout_reason");
    if (!logoutStatus && !logoutReason) return;

    const dedupeKey = `${logoutStatus ?? ""}:${logoutReason ?? ""}`;
    if (lastNoticeKey.current === dedupeKey) return;
    lastNoticeKey.current = dedupeKey;

    if (logoutStatus === "signed_out") {
      notify.success(FEEDBACK_MESSAGES.loggedOut, {
        source: "auth",
        id: "logout:signed_out"
      });
    } else if (logoutReason === "session_idle" || logoutReason === "session_revoked") {
      notify.warning(FEEDBACK_MESSAGES.sessionExpired, {
        source: "auth",
        id: `logout:${logoutReason}`
      });
    } else if (logoutReason === "disabled") {
      notify.error(FEEDBACK_MESSAGES.accessDenied, {
        source: "auth",
        id: "logout:disabled",
        description: "This account has been disabled. Contact support."
      });
    }

    const cleanedParams = new URLSearchParams(searchParams.toString());
    for (const key of LOGOUT_PARAMS) {
      cleanedParams.delete(key);
    }
    const cleanedQuery = cleanedParams.toString();
    const cleanedUrl = cleanedQuery ? `${pathname}?${cleanedQuery}` : pathname;
    router.replace(cleanedUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  return null;
}
