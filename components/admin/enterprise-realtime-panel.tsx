"use client";

import { ENTERPRISE_REALTIME_SCOPES, type EnterpriseRealtimeScope } from "@/services/enterprise-realtime";
import { useEnterpriseRealtime } from "@/hooks/use-enterprise-realtime";

type EnterpriseRealtimePanelProps = {
  scope: EnterpriseRealtimeScope;
  compact?: boolean;
};

function statusLabel(status: string) {
  if (status === "connected") return "LIVE";
  if (status === "reconnecting") return "RECONNECTING";
  if (status === "closed") return "CLOSED";
  if (status === "error") return "ERROR";
  return "CONNECTING";
}

export function EnterpriseRealtimePanel({ scope, compact = false }: EnterpriseRealtimePanelProps) {
  const { events, diagnostics } = useEnterpriseRealtime(scope, { refreshOnEvent: false });
  const config = ENTERPRISE_REALTIME_SCOPES[scope];
  const latestEvents = events.slice(0, compact ? 2 : 4);

  return (
    <section
      data-enterprise-realtime-panel={scope}
      data-enterprise-realtime-status={diagnostics.status}
      className="rounded-2xl border border-white/10 bg-black/22 p-4 text-white shadow-[0_18px_70px_rgba(0,0,0,.25)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7ce7c9]">Realtime</p>
          <h2 className="mt-1 text-sm font-semibold text-white/84">{config.label}</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/58">
          {statusLabel(diagnostics.status)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/34">Tables</p>
          <p className="mt-1 font-[var(--type-display)] text-xl font-semibold">{diagnostics.tables.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/34">Events</p>
          <p className="mt-1 font-[var(--type-display)] text-xl font-semibold">{diagnostics.receivedEvents}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/34">Reconnects</p>
          <p className="mt-1 font-[var(--type-display)] text-xl font-semibold">{diagnostics.reconnectAttempts}</p>
        </div>
      </div>

      {!compact ? (
        <>
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/34">Channel</p>
            <p className="mt-1 break-all font-mono text-[11px] text-white/52">{diagnostics.channelName}</p>
            {diagnostics.lastError ? <p className="mt-2 text-xs text-[#ffb4a8]">{diagnostics.lastError}</p> : null}
          </div>
          <div data-realtime-security-diagnostics className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/34">Subscription security</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-white/58">
              <span>Errors {diagnostics.subscriptionErrors}</span>
              <span>Stale {diagnostics.staleEvents}</span>
              <span>Anomalies {diagnostics.securityAnomalies}</span>
            </div>
          </div>
        </>
      ) : null}

      <div className="mt-4 grid gap-2">
        {latestEvents.length ? latestEvents.map((event) => (
          <div key={`${event.table}-${event.eventType}-${event.commitTimestamp}-${JSON.stringify(event.record ?? event.oldRecord ?? {})}`} className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">
            <p className="text-xs font-semibold text-white/76">{event.table}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-white/38">{event.eventType} {event.commitTimestamp ?? ""}</p>
          </div>
        )) : (
          <p className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-white/42">
            Waiting for protected operational events.
          </p>
        )}
      </div>
    </section>
  );
}
