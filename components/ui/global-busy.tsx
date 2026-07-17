"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

type GlobalBusyContextValue = {
  busyCount: number;
  isBusy: boolean;
  /** Timestamp when the current busy session began (ms). */
  busyStartedAt: number | null;
  beginBusy: (id: string) => void;
  endBusy: (id: string) => void;
};

const GlobalBusyContext = createContext<GlobalBusyContextValue | null>(null);

/** Soft ceiling so the ring keeps moving during long waits without claiming 100% early. */
const PROGRESS_CEILING = 92;
/** Typical sign-in / product-save wall time used to pace the ring. */
const EXPECTED_BUSY_MS = 12_000;
/** Progress UI tick — slow enough to avoid update-depth storms under concurrent re-renders. */
const PROGRESS_TICK_MS = 400;

type BusyState = {
  keys: Set<string>;
  busyStartedAt: number | null;
};

export function GlobalBusyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BusyState>(() => ({
    keys: new Set(),
    busyStartedAt: null
  }));

  const beginBusy = useCallback((id: string) => {
    setState((prev) => {
      if (prev.keys.has(id)) return prev;
      const keys = new Set(prev.keys);
      keys.add(id);
      return {
        keys,
        busyStartedAt: prev.keys.size === 0 ? Date.now() : prev.busyStartedAt
      };
    });
  }, []);

  const endBusy = useCallback((id: string) => {
    setState((prev) => {
      if (!prev.keys.has(id)) return prev;
      const keys = new Set(prev.keys);
      keys.delete(id);
      return {
        keys,
        busyStartedAt: keys.size === 0 ? null : prev.busyStartedAt
      };
    });
  }, []);

  const value = useMemo<GlobalBusyContextValue>(
    () => ({
      busyCount: state.keys.size,
      isBusy: state.keys.size > 0,
      busyStartedAt: state.busyStartedAt,
      beginBusy,
      endBusy
    }),
    [state.keys, state.busyStartedAt, beginBusy, endBusy]
  );

  return <GlobalBusyContext.Provider value={value}>{children}</GlobalBusyContext.Provider>;
}

export function useGlobalBusy() {
  const ctx = useContext(GlobalBusyContext);
  if (!ctx) {
    throw new Error("useGlobalBusy must be used within GlobalBusyProvider");
  }
  return ctx;
}

/** Safe hook when provider may be absent (e.g. tests). */
export function useOptionalGlobalBusy() {
  return useContext(GlobalBusyContext);
}

function estimateBusyProgress(startedAt: number | null, now: number) {
  if (!startedAt) return 0;
  const elapsed = Math.max(0, now - startedAt);
  // Asymptotic approach toward the ceiling so long waits keep advancing.
  const ratio = 1 - Math.exp(-elapsed / (EXPECTED_BUSY_MS / 2.2));
  return Math.min(PROGRESS_CEILING, Math.round(ratio * PROGRESS_CEILING));
}

type RoundProgressProps = {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

/** Determinate circular progress ring (real progress, not an infinite spin mock). */
export function RoundProgress({ value, size = 20, strokeWidth = 2.5, className }: RoundProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("-rotate-90", className)}
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="opacity-20"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-[stroke-dashoffset] duration-200 ease-linear"
      />
    </svg>
  );
}

type SpinnerProps = {
  className?: string;
  /** When true, use fixed top-right instead of inline topbar slot. */
  fixed?: boolean;
};

export function GlobalBusySpinner({ className, fixed = false }: SpinnerProps) {
  const ctx = useOptionalGlobalBusy();
  const isBusy = Boolean(ctx?.isBusy);
  const busyStartedAt = ctx?.busyStartedAt ?? null;
  const [progress, setProgress] = useState(0);
  const lastProgressRef = useRef(0);

  useEffect(() => {
    if (!isBusy || busyStartedAt == null) {
      lastProgressRef.current = 0;
      setProgress(0);
      return;
    }

    const syncProgress = () => {
      const next = estimateBusyProgress(busyStartedAt, Date.now());
      if (next !== lastProgressRef.current) {
        lastProgressRef.current = next;
        setProgress(next);
      }
    };

    syncProgress();
    const tickId = window.setInterval(syncProgress, PROGRESS_TICK_MS);

    return () => {
      window.clearInterval(tickId);
    };
  }, [isBusy, busyStartedAt]);

  if (!isBusy) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading ${progress}%`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      data-global-busy-indicator
      data-progress={progress}
      className={cn(
        fixed
          ? "pointer-events-none fixed top-4 right-4 z-[60] text-[var(--platform-text-primary,#111)]"
          : "grid h-9 w-9 shrink-0 place-items-center text-[var(--platform-text-primary)]",
        className
      )}
    >
      <RoundProgress value={progress} size={fixed ? 22 : 18} />
      <span className="sr-only">{`Loading ${progress}%`}</span>
    </div>
  );
}

/**
 * Fixed top-right fallback for pages without platform topbar (e.g. login).
 * Hidden when a topbar host claims the slot via data attribute.
 */
export function GlobalBusyFixedIndicator() {
  const ctx = useOptionalGlobalBusy();
  const [topbarHosted, setTopbarHosted] = useState(false);

  useEffect(() => {
    const sync = () => {
      setTopbarHosted((prev) => {
        const next = Boolean(document.querySelector("[data-global-busy-topbar-host]"));
        return prev === next ? prev : next;
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!ctx?.isBusy || topbarHosted) return null;
  return <GlobalBusySpinner fixed />;
}

/** Syncs React server-action form pending into global busy. Must be inside a <form>. */
export function FormBusyBridge({ id = "form" }: { id?: string }) {
  const { pending } = useFormStatus();
  const busyCtx = useOptionalGlobalBusy();
  const beginBusy = busyCtx?.beginBusy;
  const endBusy = busyCtx?.endBusy;

  useEffect(() => {
    if (!beginBusy || !endBusy) return;
    if (pending) beginBusy(id);
    else endBusy(id);
    return () => endBusy(id);
  }, [beginBusy, endBusy, id, pending]);

  return null;
}

/** Sync an external pending boolean (e.g. useActionState) into global busy. */
export function useSyncGlobalBusy(id: string, pending: boolean) {
  const busyCtx = useOptionalGlobalBusy();
  const beginBusy = busyCtx?.beginBusy;
  const endBusy = busyCtx?.endBusy;

  useEffect(() => {
    if (!beginBusy || !endBusy) return;
    if (pending) beginBusy(id);
    else endBusy(id);
    return () => endBusy(id);
  }, [beginBusy, endBusy, id, pending]);
}
