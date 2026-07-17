"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { notify } from "@/lib/feedback/notify";
import { ToastProvider } from "@/components/notifications/toast-provider";

const STATUS_SUFFIX = "_status";
const MESSAGE_SUFFIX = "_message";
const VALID_STATUSES = new Set(["success", "error", "warning"]);

const EXTRA_PARAMS_BY_STATUS_KEY: Record<string, string[]> = {
  cms_status: ["cms_table"]
};

function messageKeyFor(statusKey: string) {
  return statusKey.replace(/_status$/, MESSAGE_SUFFIX);
}

function toastTitle(statusKey: string) {
  return statusKey
    .replace(/_status$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function findStatusEntries(searchParams: URLSearchParams) {
  const entries: Array<{ statusKey: string; status: string; message: string }> = [];

  for (const [key, value] of searchParams.entries()) {
    if (!key.endsWith(STATUS_SUFFIX) || !value) continue;
    if (!VALID_STATUSES.has(value)) continue;

    const message = searchParams.get(messageKeyFor(key)) ?? "Action completed.";
    entries.push({ statusKey: key, status: value, message });
  }

  return entries;
}

export function OperatorToastBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastToastKey = useRef<string | null>(null);

  useEffect(() => {
    const statusEntries = findStatusEntries(searchParams);
    if (statusEntries.length === 0) return;

    const { statusKey, status, message } = statusEntries[0];
    const dedupeKey = `${statusKey}:${status}:${message}`;
    if (lastToastKey.current === dedupeKey) return;

    lastToastKey.current = dedupeKey;
    const title = toastTitle(statusKey);
    const cleanedParams = new URLSearchParams(searchParams.toString());
    cleanedParams.delete(statusKey);
    cleanedParams.delete(messageKeyFor(statusKey));
    for (const extraKey of EXTRA_PARAMS_BY_STATUS_KEY[statusKey] ?? []) {
      cleanedParams.delete(extraKey);
    }
    const cleanedQuery = cleanedParams.toString();
    const cleanedUrl = cleanedQuery ? `${pathname}?${cleanedQuery}` : pathname;

    if (status === "success") {
      notify.success(title, { description: message, source: "operator", id: dedupeKey });
    } else if (status === "warning") {
      notify.warning(title, { description: message, source: "operator", id: dedupeKey });
    } else {
      notify.error(title, { description: message, source: "operator", id: dedupeKey });
    }

    router.replace(cleanedUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  return (
    <ToastProvider theme="controlPlane" desktopPosition="top-right" />
  );
}
