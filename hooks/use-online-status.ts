"use client";

import { useEffect, useState } from "react";

const OFFLINE_CONFIRM_MS = 1200;
const PROBE_TIMEOUT_MS = 2500;
const PROBE_RETRY_MS = 8000;

function readNavigatorOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function probeConnectivity(signal: AbortSignal) {
  try {
    // Same-origin HEAD avoids CORS and confirms the browser can reach the app origin.
    // `cache: "no-store"` prevents a cached 200 from masking a real outage.
    const response = await fetch("/favicon.svg", {
      method: "HEAD",
      cache: "no-store",
      signal
    });
    return response.ok || response.status === 405 || response.status === 404;
  } catch {
    return false;
  }
}

/**
 * Storefront connectivity for the offline banner.
 * `navigator.onLine` alone is flaky (VPN, brief blips, automation), so we only
 * mark offline after a failed same-origin probe, and recover as soon as a probe succeeds.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let confirmTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let probeController: AbortController | null = null;

    const clearTimers = () => {
      if (confirmTimer) {
        clearTimeout(confirmTimer);
        confirmTimer = undefined;
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    };

    const abortProbe = () => {
      probeController?.abort();
      probeController = null;
    };

    const scheduleRetry = () => {
      if (cancelled || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void confirmConnectivity();
      }, PROBE_RETRY_MS);
    };

    const confirmConnectivity = async () => {
      if (cancelled) return;

      if (readNavigatorOnline()) {
        // Browser says online — trust that for recovery, and clear any pending offline confirm.
        clearTimers();
        abortProbe();
        setOnline(true);
        return;
      }

      abortProbe();
      probeController = new AbortController();
      const timeout = setTimeout(() => probeController?.abort(), PROBE_TIMEOUT_MS);

      try {
        const reachable = await probeConnectivity(probeController.signal);
        if (cancelled) return;
        if (reachable) {
          setOnline(true);
          return;
        }
        setOnline(false);
        scheduleRetry();
      } finally {
        clearTimeout(timeout);
      }
    };

    const handleOnline = () => {
      clearTimers();
      abortProbe();
      setOnline(true);
    };

    const handleOffline = () => {
      // Debounce: browsers often fire a brief offline blip that recovers immediately.
      clearTimers();
      confirmTimer = setTimeout(() => {
        confirmTimer = undefined;
        void confirmConnectivity();
      }, OFFLINE_CONFIRM_MS);
    };

    // Sync once on mount. If navigator already reports offline, confirm before showing the banner.
    if (!readNavigatorOnline()) {
      handleOffline();
    } else {
      setOnline(true);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      cancelled = true;
      clearTimers();
      abortProbe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
