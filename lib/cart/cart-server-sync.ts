"use client";

import type { PersistedCartItem } from "@/config/types";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const SYNC_DEBOUNCE_MS = 300;

let syncTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let inflightSync: Promise<void> | null = null;
let pendingItems: PersistedCartItem[] | null = null;
let lastKnownUpdatedAt: string | null = null;

type SyncLifecycle = {
  onStart?: () => void;
  onComplete?: () => void;
};

type RemoteCartPayload = {
  items: PersistedCartItem[];
  updatedAt: string | null;
};

function cartLineKey(item: Pick<PersistedCartItem, "productSlug" | "bundleId" | "variantId">) {
  return `${item.productSlug}:${item.bundleId}:${item.variantId ?? ""}`;
}

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(99, Math.trunc(value)));
}

function mergeCartArrays(serverItems: PersistedCartItem[], localItems: PersistedCartItem[]) {
  const merged = new Map<string, PersistedCartItem>();
  const order: string[] = [];

  const ingest = (items: PersistedCartItem[], preferDisplayFields: boolean) => {
    for (const item of items) {
      const key = cartLineKey(item);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...item, quantity: clampQuantity(item.quantity) });
        order.push(key);
        continue;
      }
      const nextQuantity = clampQuantity(existing.quantity + item.quantity);
      merged.set(key, {
        ...existing,
        ...(preferDisplayFields && item.productName ? { productName: item.productName } : {}),
        ...(preferDisplayFields && item.bundleName ? { bundleName: item.bundleName } : {}),
        ...(preferDisplayFields && item.image ? { image: item.image } : {}),
        quantity: nextQuantity
      });
    }
  };

  ingest(serverItems, false);
  ingest(localItems, true);

  return order.map((key) => merged.get(key)!).filter(Boolean);
}

export function mergeCartItemLists(serverItems: PersistedCartItem[], localItems: PersistedCartItem[]) {
  return mergeCartArrays(serverItems, localItems);
}

async function putAuthenticatedCartItems(items: PersistedCartItem[]): Promise<
  | { ok: true; payload: RemoteCartPayload }
  | { ok: false; conflict: true; payload: RemoteCartPayload }
> {
  const response = await fetchWithTimeout("/api/account/cart", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(lastKnownUpdatedAt ? { "X-Cart-Updated-At": lastKnownUpdatedAt } : {})
    },
    body: JSON.stringify({ items }),
    cache: "no-store"
  });

  const json = (await response.json().catch(() => ({}))) as Partial<RemoteCartPayload> & {
    error?: string;
    code?: string;
  };
  const payload: RemoteCartPayload = {
    items: Array.isArray(json.items) ? (json.items as PersistedCartItem[]) : [],
    updatedAt: typeof json.updatedAt === "string" ? json.updatedAt : null
  };

  if (response.status === 409) {
    lastKnownUpdatedAt = payload.updatedAt;
    return { ok: false, conflict: true, payload };
  }

  if (response.status === 403 && json.code === "profile_incomplete") {
    return { ok: true, payload: { items, updatedAt: lastKnownUpdatedAt } };
  }

  if (!response.ok) {
    throw new Error(json.error ?? "Unable to sync authenticated cart.");
  }

  lastKnownUpdatedAt = payload.updatedAt;
  return { ok: true, payload };
}

export async function fetchAuthenticatedCartItems(): Promise<RemoteCartPayload> {
  const response = await fetchWithTimeout("/api/account/cart", { cache: "no-store" });
  if (response.status === 401) {
    lastKnownUpdatedAt = null;
    return { items: [], updatedAt: null };
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
    // Incomplete profile is expected while gated to /account/complete-profile — don't throw.
    if (response.status === 403 && payload.code === "profile_incomplete") {
      return { items: [], updatedAt: null };
    }
    throw new Error(payload.error ?? "Unable to load authenticated cart.");
  }
  const payload = (await response.json().catch(() => ({}))) as Partial<RemoteCartPayload>;
  const items = Array.isArray(payload.items) ? (payload.items as PersistedCartItem[]) : [];
  const updatedAt = typeof payload.updatedAt === "string" ? payload.updatedAt : null;
  lastKnownUpdatedAt = updatedAt;
  return { items, updatedAt };
}

export async function clearAuthenticatedCartRemote() {
  const response = await fetch("/api/account/cart", {
    method: "DELETE",
    cache: "no-store"
  });

  if (response.status === 401) return;
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
    if (response.status === 403 && payload.code === "profile_incomplete") return;
    throw new Error(payload.error ?? "Unable to clear authenticated cart.");
  }
}

export async function flushAuthenticatedCartSync(
  items: PersistedCartItem[],
  lifecycle: SyncLifecycle = {}
) {
  if (inflightSync) {
    pendingItems = items;
    await inflightSync;
    if (pendingItems) {
      const nextItems = pendingItems;
      pendingItems = null;
      await flushAuthenticatedCartSync(nextItems, lifecycle);
    }
    return;
  }

  lifecycle.onStart?.();
  inflightSync = (async () => {
    try {
      let attempt = 0;
      let nextItems = items;
      while (attempt < 2) {
        // First attempt uses lastKnownUpdatedAt. If server reports conflict, merge and retry once.
        const result = await putAuthenticatedCartItems(nextItems);
        if (result.ok) {
          return;
        }
        if (result.conflict) {
          nextItems = mergeCartArrays(result.payload.items, nextItems);
          attempt += 1;
          continue;
        }
        return;
      }
    } finally {
      inflightSync = null;
      lifecycle.onComplete?.();
    }
  })();

  await inflightSync;

  if (pendingItems) {
    const nextItems = pendingItems;
    pendingItems = null;
    await flushAuthenticatedCartSync(nextItems, lifecycle);
  }
}

export function queueAuthenticatedCartSync(
  items: PersistedCartItem[],
  lifecycle: SyncLifecycle = {},
  force = false
) {
  if (force) {
    if (syncTimer) {
      globalThis.clearTimeout(syncTimer);
      syncTimer = null;
    }
    void flushAuthenticatedCartSync(items, lifecycle);
    return;
  }

  if (syncTimer) {
    globalThis.clearTimeout(syncTimer);
  }

  syncTimer = globalThis.setTimeout(() => {
    syncTimer = null;
    void flushAuthenticatedCartSync(items, lifecycle);
  }, SYNC_DEBOUNCE_MS);
}

export function cancelAuthenticatedCartSync() {
  if (syncTimer) {
    globalThis.clearTimeout(syncTimer);
    syncTimer = null;
  }
  pendingItems = null;
}
