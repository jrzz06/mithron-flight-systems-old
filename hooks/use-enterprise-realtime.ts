"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { subscribeSharedEnterpriseRealtime } from "@/lib/control-plane/shared-enterprise-realtime";
import {
  type EnterpriseRealtimeDiagnostics,
  type EnterpriseRealtimeEvent,
  type EnterpriseRealtimeScope
} from "@/services/enterprise-realtime";

const defaultDiagnostics = (scope: EnterpriseRealtimeScope): EnterpriseRealtimeDiagnostics => ({
  scope,
  status: "idle",
  channelName: `enterprise-${scope}:pending`,
  tables: [],
  subscribedAt: null,
  lastEventAt: null,
  lastReplayAt: null,
  lastError: null,
  receivedEvents: 0,
  duplicateEvents: 0,
  staleEvents: 0,
  reconnectAttempts: 0,
  subscriptionErrors: 0,
  securityAnomalies: 0
});

export function useEnterpriseRealtime(scope: EnterpriseRealtimeScope, options: { refreshOnEvent?: boolean } = {}) {
  const refreshOnEvent = options.refreshOnEvent ?? false;
  const [events, setEvents] = useState<EnterpriseRealtimeEvent[]>([]);
  const [diagnostics, setDiagnostics] = useState<EnterpriseRealtimeDiagnostics>(() => defaultDiagnostics(scope));
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    function scheduleRefresh() {
      if (!refreshOnEvent) return;
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        startTransition(() => {
          setDiagnostics((current) => ({
            ...current,
            lastReplayAt: new Date().toISOString()
          }));
        });
      }, 650);
    }

    return subscribeSharedEnterpriseRealtime(scope, {
      onEvent: (event) => {
        setEvents((current) => [event, ...current].slice(0, 40));
        scheduleRefresh();
      },
      onDiagnostics: setDiagnostics,
      onReplayRequired: () => {
        scheduleRefresh();
      }
    });
  }, [refreshOnEvent, scope]);

  useEffect(() => {
    setDiagnostics(defaultDiagnostics(scope));
    setEvents([]);
  }, [scope]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, []);

  return { events, diagnostics };
}
