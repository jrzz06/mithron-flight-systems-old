"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect, type ReactNode } from "react";
import {
  flushObservabilityQueue,
  recordAnalyticsEvent,
  recordClientError,
  recordWebVital
} from "@/lib/observability";

type ObservabilityProviderProps = {
  children: ReactNode;
};

export function ObservabilityProvider({ children }: ObservabilityProviderProps) {
  const pathname = usePathname();

  useReportWebVitals((metric) => {
    recordWebVital({
      name: metric.name,
      value: metric.value,
      rating: metric.rating
    });
  });

  useEffect(() => {
    recordAnalyticsEvent("route.view", { pathname }, pathname);
  }, [pathname]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const error = event.error instanceof Error ? event.error : null;
      recordClientError({
        name: error?.name ?? "WindowError",
        message: event.message,
        stack: error?.stack,
        route: window.location.pathname
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const error = reason instanceof Error ? reason : null;
      recordClientError({
        name: error?.name ?? "UnhandledRejection",
        message: error?.message ?? String(reason),
        stack: error?.stack,
        route: window.location.pathname
      });
    };

    const flushOnHidden = () => {
      if (document.visibilityState === "hidden") {
        flushObservabilityQueue();
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    document.addEventListener("visibilitychange", flushOnHidden);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      document.removeEventListener("visibilitychange", flushOnHidden);
      flushObservabilityQueue();
    };
  }, []);

  return children;
}
