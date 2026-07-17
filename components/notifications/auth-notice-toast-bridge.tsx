"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { mapAuthPageNotice } from "@/lib/auth/client-errors";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { notify } from "@/lib/feedback/notify";

const AUTH_NOTICE_PARAMS = [
  "auth_error",
  "auth_status",
  "logout_status",
  "logout_reason",
  "logout_notice",
  "admin_status",
  "access_status"
] as const;

function resolveNoticeVariant(
  tone: "error" | "neutral",
  message: string
): "error" | "warning" | "info" | "success" {
  if (tone === "error") return "error";

  const lower = message.toLowerCase();
  if (lower.includes("signed out") || lower.includes("logout")) return "success";
  if (
    lower.includes("session")
    || lower.includes("sign-in ended")
    || lower.includes("revoked")
  ) {
    return "warning";
  }
  if (lower.includes("permission") || lower.includes("access denied")) {
    return "warning";
  }

  return "info";
}

function resolveNoticeTitle(message: string, variant: "error" | "warning" | "info" | "success") {
  const lower = message.toLowerCase();
  if (lower.includes("invalid email or password") || lower.includes("invalid credentials")) {
    return FEEDBACK_MESSAGES.invalidCredentials;
  }
  if (lower.includes("session") || lower.includes("sign-in ended") || lower.includes("revoked")) {
    return FEEDBACK_MESSAGES.sessionExpired;
  }
  if (lower.includes("permission") || lower.includes("access denied")) {
    return FEEDBACK_MESSAGES.accessDenied;
  }
  if (lower.includes("signed out") || lower.includes("logout")) {
    return FEEDBACK_MESSAGES.loggedOut;
  }
  if (variant === "error") return FEEDBACK_MESSAGES.genericError;
  return message;
}

export function AuthNoticeToastBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastNoticeKey = useRef<string | null>(null);

  useEffect(() => {
    const noticeInput = {
      auth_error: searchParams.get("auth_error"),
      auth_status: searchParams.get("auth_status"),
      logout_status: searchParams.get("logout_status"),
      logout_reason: searchParams.get("logout_reason"),
      logout_notice: searchParams.get("logout_notice"),
      admin_status: searchParams.get("admin_status"),
      access_status: searchParams.get("access_status")
    };

    const hasNoticeParam = AUTH_NOTICE_PARAMS.some((key) => searchParams.get(key));
    if (!hasNoticeParam) return;

    const notice = mapAuthPageNotice(noticeInput);
    if (!notice) return;

    const dedupeKey = JSON.stringify(noticeInput);
    if (lastNoticeKey.current === dedupeKey) return;
    lastNoticeKey.current = dedupeKey;

    const variant = resolveNoticeVariant(notice.tone, notice.message);
    const title = resolveNoticeTitle(notice.message, variant);
    const options = {
      source: "auth",
      id: `auth-notice:${dedupeKey}`,
      description: title === notice.message ? undefined : notice.message
    };

    if (variant === "success") {
      notify.success(title, options);
    } else if (variant === "warning") {
      notify.warning(title, options);
    } else if (variant === "error") {
      notify.error(title, options);
    } else {
      notify.info(title, options);
    }

    const cleanedParams = new URLSearchParams(searchParams.toString());
    for (const key of AUTH_NOTICE_PARAMS) {
      cleanedParams.delete(key);
    }
    const cleanedQuery = cleanedParams.toString();
    const cleanedUrl = cleanedQuery ? `${pathname}?${cleanedQuery}` : pathname;
    router.replace(cleanedUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  return null;
}
