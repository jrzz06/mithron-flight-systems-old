"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEnterpriseRealtime } from "@/hooks/use-enterprise-realtime";
import { wasControlPlaneRecentlyFlushed } from "@/lib/control-plane/shared-live-sync-coordinator";
import { relativeTimeLabel } from "@/lib/platform/copy";
import type { EnterpriseRealtimeScope } from "@/services/enterprise-realtime";

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  status: string;
  priority?: string | null;
  entity_table?: string | null;
  entity_id?: string | null;
  created_at?: string;
};

type NotificationBellProps = {
  href?: string;
  recipientId: string;
  pollIntervalMs?: number;
  realtimeScope?: EnterpriseRealtimeScope;
};

// Realtime is the primary transport when a scope is provided; polling is only
// a slow reconciliation fallback in that case.
const REALTIME_FALLBACK_POLL_MS = 120_000;

function NotificationBellRealtimeSync({
  scope,
  onRefresh
}: {
  scope: EnterpriseRealtimeScope;
  onRefresh: () => void;
}) {
  const { diagnostics } = useEnterpriseRealtime(scope, { refreshOnEvent: true });
  const lastEventAt = useRef<string | null>(null);

  useEffect(() => {
    if (!diagnostics.lastEventAt || diagnostics.lastEventAt === lastEventAt.current) return;
    lastEventAt.current = diagnostics.lastEventAt;
    onRefresh();
  }, [diagnostics.lastEventAt, diagnostics.receivedEvents, onRefresh]);

  return null;
}

function notificationTarget(
  row: NotificationRow,
  scope: EnterpriseRealtimeScope | undefined,
  fallbackHref: string
) {
  if (row.entity_table === "orders" && row.entity_id) {
    if (scope === "admin" || scope === "operations") return `/admin/orders?order=${encodeURIComponent(row.entity_id)}`;
    if (scope === "warehouse") return `/warehouse/orders/${encodeURIComponent(row.entity_id)}`;
  }
  if (row.entity_table === "enquiries" && (scope === "admin" || scope === "operations")) {
    return row.entity_id
      ? `/admin/enquiries?open=${encodeURIComponent(row.entity_id)}`
      : "/admin/enquiries";
  }
  if (row.entity_table === "contact_requests" && (scope === "admin" || scope === "operations")) {
    return row.entity_id
      ? `/admin/contact-requests?open=${encodeURIComponent(row.entity_id)}`
      : "/admin/contact-requests";
  }
  return fallbackHref;
}

export function NotificationBell({
  href = "/account",
  recipientId,
  pollIntervalMs,
  realtimeScope
}: NotificationBellProps) {
  const router = useRouter();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const effectivePollMs = pollIntervalMs ?? (realtimeScope ? REALTIME_FALLBACK_POLL_MS : 30_000);

  const applyPayload = useCallback((payload: { notifications?: unknown; unreadCount?: unknown }) => {
    const list = Array.isArray(payload.notifications) ? payload.notifications as NotificationRow[] : [];
    setRows(list);
    setUnreadCount(
      typeof payload.unreadCount === "number"
        ? payload.unreadCount
        : list.filter((row) => row.status === "unread").length
    );
  }, []);

  const refreshNotifications = useCallback(() => {
    fetch(`/api/notifications?recipient=${encodeURIComponent(recipientId)}`)
      .then((response) => (response.ok ? response.json() : { notifications: [] }))
      .then(applyPayload)
      .catch(() => undefined);
  }, [applyPayload, recipientId]);

  const refreshNotificationsFromPoll = useCallback(() => {
    if (wasControlPlaneRecentlyFlushed(effectivePollMs)) return;
    refreshNotifications();
  }, [effectivePollMs, refreshNotifications]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    function loadNotifications() {
      fetch(`/api/notifications?recipient=${encodeURIComponent(recipientId)}`, {
        signal: controller.signal
      })
        .then((response) => (response.ok ? response.json() : { notifications: [] }))
        .then((payload) => {
          if (!active) return;
          applyPayload(payload);
        })
        .catch(() => undefined);
    }

    const deferHandle = window.setTimeout(loadNotifications, 250);
    const interval = window.setInterval(() => {
      if (!active || document.hidden) return;
      refreshNotificationsFromPoll();
    }, effectivePollMs);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(deferHandle);
      window.clearInterval(interval);
    };
  }, [applyPayload, effectivePollMs, recipientId, refreshNotificationsFromPoll]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const markRead = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setRows((current) => current.map((row) => (ids.includes(row.id) ? { ...row, status: "read" } : row)));
    setUnreadCount((current) => Math.max(0, current - ids.length));
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids })
    }).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(() => {
    setRows((current) => current.map((row) => ({ ...row, status: "read" })));
    setUnreadCount(0);
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true })
    }).catch(() => undefined);
  }, []);

  const openNotification = useCallback((row: NotificationRow) => {
    if (row.status === "unread") markRead([row.id]);
    setOpen(false);
    router.push(notificationTarget(row, realtimeScope, href));
  }, [href, markRead, realtimeScope, router]);

  return (
    <div ref={containerRef} className="relative">
      {realtimeScope ? <NotificationBellRealtimeSync scope={realtimeScope} onRefresh={refreshNotifications} /> : null}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        data-notification-bell
        className="relative grid h-9 w-9 place-items-center rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface)] text-[var(--platform-text-muted)] transition hover:bg-[var(--platform-surface-muted)] hover:text-[var(--platform-text-secondary)]"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-[var(--platform-accent-soft)] px-1 text-[10px] font-medium text-[var(--platform-text-secondary)] ring-1 ring-[var(--platform-border-strong)]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-11 z-50 w-[min(92vw,360px)] overflow-hidden rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface-raised)]"
          style={{ boxShadow: "var(--platform-shadow-md)" }}
        >
          <div className="flex items-center justify-between border-b border-[var(--platform-border)] px-3 py-2.5">
            <p className="text-sm font-medium text-[var(--platform-text-primary)]">Notifications</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-xs font-medium text-[var(--platform-text-muted)] transition hover:bg-[var(--platform-surface-muted)] hover:text-[var(--platform-text-secondary)]"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto">
            {rows.length ? (
              rows.map((row) => {
                const unread = row.status === "unread";
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => openNotification(row)}
                    className={`grid w-full gap-0.5 border-b border-[var(--platform-border)] px-3 py-2.5 text-left transition last:border-b-0 hover:bg-[var(--platform-surface-muted)] ${
                      unread ? "bg-[var(--platform-accent-soft)]/40" : ""
                    }`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className={`text-sm ${unread ? "font-semibold text-[var(--platform-text-primary)]" : "font-medium text-[var(--platform-text-secondary)]"}`}>
                        {row.title}
                      </span>
                      {unread ? (
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--platform-accent)]"
                          aria-label="Unread"
                        />
                      ) : null}
                    </span>
                    <span className="line-clamp-2 text-xs text-[var(--platform-text-muted)]">{row.body}</span>
                    {row.created_at ? (
                      <span className="text-[11px] text-[var(--platform-text-muted)]">{relativeTimeLabel(row.created_at)}</span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-6 text-center text-sm text-[var(--platform-text-muted)]">
                You&apos;re all caught up.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
