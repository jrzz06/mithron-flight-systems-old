"use client";

import { createClient } from "@/lib/client";
import {
  createEnterpriseRealtimeManager,
  type EnterpriseRealtimeDiagnostics,
  type EnterpriseRealtimeEvent,
  type EnterpriseRealtimeScope
} from "@/services/enterprise-realtime";

type SharedRealtimeListener = {
  onEvent?: (event: EnterpriseRealtimeEvent, diagnostics: EnterpriseRealtimeDiagnostics) => void;
  onDiagnostics?: (diagnostics: EnterpriseRealtimeDiagnostics) => void;
  onReplayRequired?: (diagnostics: EnterpriseRealtimeDiagnostics) => void;
};

type SharedRealtimeEntry = {
  manager: ReturnType<typeof createEnterpriseRealtimeManager>;
  listeners: Set<SharedRealtimeListener>;
  refCount: number;
};

const sharedRealtimeEntries = new Map<EnterpriseRealtimeScope, SharedRealtimeEntry>();

function getOrCreateSharedRealtimeEntry(scope: EnterpriseRealtimeScope) {
  let entry = sharedRealtimeEntries.get(scope);
  if (entry) return entry;

  const supabase = createClient();
  const listeners = new Set<SharedRealtimeListener>();
  const manager = createEnterpriseRealtimeManager({
    supabase,
    scope,
    onEvent: (event, diagnostics) => {
      for (const listener of listeners) {
        listener.onEvent?.(event, diagnostics);
      }
    },
    onDiagnostics: (diagnostics) => {
      for (const listener of listeners) {
        listener.onDiagnostics?.(diagnostics);
      }
    },
    onReplayRequired: (diagnostics) => {
      for (const listener of listeners) {
        listener.onReplayRequired?.(diagnostics);
      }
    }
  });

  entry = { manager, listeners, refCount: 0 };
  sharedRealtimeEntries.set(scope, entry);
  return entry;
}

export function subscribeSharedEnterpriseRealtime(
  scope: EnterpriseRealtimeScope,
  listener: SharedRealtimeListener
) {
  const entry = getOrCreateSharedRealtimeEntry(scope);
  entry.listeners.add(listener);
  entry.refCount += 1;

  if (entry.refCount === 1) {
    entry.manager.subscribe();
  } else {
    listener.onDiagnostics?.(entry.manager.getDiagnostics());
  }

  return () => {
    entry.listeners.delete(listener);
    entry.refCount -= 1;

    if (entry.refCount <= 0) {
      void entry.manager.unsubscribe();
      sharedRealtimeEntries.delete(scope);
    }
  };
}
