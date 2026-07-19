/**
 * Lightweight action-timing harness for measurement-first perf work.
 * Enabled when PERF_ACTION_TIMING=1 or NODE_ENV=development.
 * Logs: [perf] panel=… action=… ms=… ok=…
 */

export type PerfPanel = "customer" | "admin" | "warehouse" | "supplier" | "shared";

export type PerfActionMeta = {
  panel?: PerfPanel;
  ok?: boolean;
  error?: string;
  phase?: "pending" | "settled" | "server";
  extra?: Record<string, string | number | boolean | undefined>;
};

type PerfSample = {
  id: string;
  panel: PerfPanel;
  action: string;
  ms: number;
  ok: boolean;
  phase: string;
  at: string;
  extra?: Record<string, string | number | boolean | undefined>;
};

const starts = new Map<string, number>();
const samples: PerfSample[] = [];
const MAX_SAMPLES = 500;

function perfTimingEnabled() {
  if (typeof process !== "undefined" && process.env.PERF_ACTION_TIMING === "1") return true;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") return true;
  if (typeof window !== "undefined") {
    try {
      return window.localStorage?.getItem("PERF_ACTION_TIMING") === "1";
    } catch {
      return false;
    }
  }
  return false;
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function sampleKey(action: string, token?: string) {
  return token ? `${action}::${token}` : action;
}

export function markActionStart(action: string, token?: string) {
  if (!perfTimingEnabled()) return;
  starts.set(sampleKey(action, token), nowMs());
}

export function markActionEnd(action: string, meta: PerfActionMeta = {}, token?: string) {
  if (!perfTimingEnabled()) return;
  const key = sampleKey(action, token);
  const started = starts.get(key);
  starts.delete(key);
  const ms = started != null ? Math.round(nowMs() - started) : -1;
  const panel = meta.panel ?? "shared";
  const ok = meta.ok !== false;
  const phase = meta.phase ?? "settled";
  const sample: PerfSample = {
    id: `${action}-${Date.now()}`,
    panel,
    action,
    ms,
    ok,
    phase,
    at: new Date().toISOString(),
    extra: meta.extra
  };
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.shift();

  const extraBits = meta.extra
    ? Object.entries(meta.extra)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")
    : "";
  const errBit = meta.error ? ` error=${JSON.stringify(meta.error.slice(0, 120))}` : "";
  console.info(
    `[perf] panel=${panel} action=${action} phase=${phase} ms=${ms} ok=${ok}${errBit}${extraBits ? ` ${extraBits}` : ""}`
  );
  return ms;
}

/** Time an async fn end-to-end when perf timing is enabled. */
export async function timedAction<T>(
  action: string,
  fn: () => Promise<T>,
  meta: PerfActionMeta = {}
): Promise<T> {
  if (!perfTimingEnabled()) return fn();
  const token = `${Math.random().toString(36).slice(2, 8)}`;
  markActionStart(action, token);
  try {
    const result = await fn();
    markActionEnd(action, { ...meta, ok: true, phase: meta.phase ?? "settled" }, token);
    return result;
  } catch (error) {
    markActionEnd(
      action,
      {
        ...meta,
        ok: false,
        phase: meta.phase ?? "settled",
        error: error instanceof Error ? error.message : String(error)
      },
      token
    );
    throw error;
  }
}

export function getPerfSamples(): readonly PerfSample[] {
  return samples;
}

export function clearPerfSamples() {
  samples.length = 0;
  starts.clear();
}

export function summarizePerfSamples(action?: string) {
  const filtered = action ? samples.filter((s) => s.action === action) : [...samples];
  if (!filtered.length) return null;
  const times = filtered.map((s) => s.ms).filter((ms) => ms >= 0).sort((a, b) => a - b);
  if (!times.length) return null;
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const p95 = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))];
  return { count: times.length, avg, p95, min: times[0], max: times[times.length - 1] };
}
