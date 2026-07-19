"use client";

import { subscribeSharedEnterpriseRealtime } from "@/lib/control-plane/shared-enterprise-realtime";
import type { EnterpriseRealtimeScope } from "@/services/enterprise-realtime";

const DEBOUNCE_MS = 100;

type LiveSyncConsumer = {
  shouldRefresh: (table: string) => boolean;
  onAfterRefresh?: () => void;
};

type ScopeCoordinator = {
  pendingTables: Set<string>;
  flushTimer: ReturnType<typeof setTimeout> | null;
  consumers: Set<LiveSyncConsumer>;
  routerRefresh: (() => void) | null;
  preferReconcile: boolean;
  realtimeUnsubscribe: (() => void) | null;
  refCount: number;
  visibilityArmed: boolean;
  visibilityListener: (() => void) | null;
};

const coordinators = new Map<EnterpriseRealtimeScope, ScopeCoordinator>();

/** Timestamp of the last coordinated flush — used to skip redundant polling fetches. */
let lastCoordinatedFlushAt = 0;

export function markControlPlaneLiveSyncFlush() {
  lastCoordinatedFlushAt = Date.now();
}

export function wasControlPlaneRecentlyFlushed(withinMs = 15_000) {
  return Date.now() - lastCoordinatedFlushAt < withinMs;
}

function getOrCreateCoordinator(scope: EnterpriseRealtimeScope): ScopeCoordinator {
  let coordinator = coordinators.get(scope);
  if (coordinator) return coordinator;

  coordinator = {
    pendingTables: new Set(),
    flushTimer: null,
    consumers: new Set(),
    routerRefresh: null,
    preferReconcile: scope === "admin",
    realtimeUnsubscribe: null,
    refCount: 0,
    visibilityArmed: false,
    visibilityListener: null
  };
  coordinators.set(scope, coordinator);
  return coordinator;
}

async function flushCoordinator(scope: EnterpriseRealtimeScope) {
  const coordinator = coordinators.get(scope);
  if (!coordinator) return;

  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    if (!coordinator.visibilityArmed) {
      coordinator.visibilityArmed = true;
      const onVisible = () => {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", onVisible);
        coordinator.visibilityArmed = false;
        coordinator.visibilityListener = null;
        void flushCoordinator(scope);
      };
      coordinator.visibilityListener = onVisible;
      document.addEventListener("visibilitychange", onVisible);
    }
    return;
  }

  const tables = [...coordinator.pendingTables];
  coordinator.pendingTables.clear();
  coordinator.flushTimer = null;

  if (!tables.length) return;

  // Admin: never router.refresh — consumers reconcile via onAfterRefresh / AdminRealtimeProvider.
  if (!coordinator.preferReconcile && !wasControlPlaneRecentlyFlushed(2_000)) {
    coordinator.routerRefresh?.();
  }
  markControlPlaneLiveSyncFlush();

  for (const consumer of coordinator.consumers) {
    consumer.onAfterRefresh?.();
  }
}

function scheduleTableRefresh(scope: EnterpriseRealtimeScope, table: string) {
  const coordinator = getOrCreateCoordinator(scope);
  coordinator.pendingTables.add(table);

  if (coordinator.flushTimer) {
    clearTimeout(coordinator.flushTimer);
  }

  coordinator.flushTimer = setTimeout(() => {
    void flushCoordinator(scope);
  }, DEBOUNCE_MS);
}

function ensureRealtimeSubscription(scope: EnterpriseRealtimeScope) {
  const coordinator = getOrCreateCoordinator(scope);
  if (coordinator.realtimeUnsubscribe) return;

  coordinator.realtimeUnsubscribe = subscribeSharedEnterpriseRealtime(scope, {
    onEvent: (event) => {
      const active = coordinators.get(scope);
      if (!active) return;

      for (const consumer of active.consumers) {
        if (consumer.shouldRefresh(event.table)) {
          scheduleTableRefresh(scope, event.table);
        }
      }
    },
    onReplayRequired: () => {
      const active = coordinators.get(scope);
      if (!active) return;

      for (const consumer of active.consumers) {
        if (consumer.shouldRefresh("orders")) {
          scheduleTableRefresh(scope, "orders");
        }
      }
    }
  });
}

function teardownRealtimeSubscription(scope: EnterpriseRealtimeScope) {
  const coordinator = coordinators.get(scope);
  if (!coordinator || coordinator.refCount > 0) return;

  if (coordinator.flushTimer) {
    clearTimeout(coordinator.flushTimer);
    coordinator.flushTimer = null;
  }

  if (coordinator.visibilityArmed && coordinator.visibilityListener) {
    document.removeEventListener("visibilitychange", coordinator.visibilityListener);
    coordinator.visibilityArmed = false;
    coordinator.visibilityListener = null;
  }

  coordinator.pendingTables.clear();
  coordinator.realtimeUnsubscribe?.();
  coordinator.realtimeUnsubscribe = null;
  coordinators.delete(scope);
}

export function subscribeControlPlaneLiveSync(
  scope: EnterpriseRealtimeScope,
  shouldRefresh: (table: string) => boolean,
  options?: {
    onAfterRefresh?: () => void;
    routerRefresh?: () => void;
    preferReconcile?: boolean;
  }
): () => void {
  const coordinator = getOrCreateCoordinator(scope);

  const consumer: LiveSyncConsumer = {
    shouldRefresh,
    onAfterRefresh: options?.onAfterRefresh
  };

  coordinator.consumers.add(consumer);
  coordinator.refCount += 1;

  if (typeof options?.preferReconcile === "boolean") {
    coordinator.preferReconcile = options.preferReconcile;
  } else if (scope === "admin") {
    coordinator.preferReconcile = true;
  }

  if (options?.routerRefresh && !coordinator.preferReconcile) {
    coordinator.routerRefresh = options.routerRefresh;
  }

  ensureRealtimeSubscription(scope);

  return () => {
    coordinator.consumers.delete(consumer);
    coordinator.refCount -= 1;
    teardownRealtimeSubscription(scope);
  };
}
