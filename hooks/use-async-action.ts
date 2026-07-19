"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionTimeoutError,
  DEFAULT_ACTION_TIMEOUT_MS,
  raceWithTimeout
} from "@/lib/fetch-with-timeout";
import { markActionEnd, markActionStart } from "@/lib/perf/action-timer";

export type AsyncActionStatus = "idle" | "loading" | "success" | "error";

export type WrapServerActionOptions = {
  /** Wall-clock ms before rejecting with ActionTimeoutError. Defaults to 20s. */
  timeoutMs?: number;
  /** Label used in the timeout error message (e.g. "Quick restock"). */
  label?: string;
};

/**
 * Wrap any async action (Server Action, bridge wrapper, or plain Promise factory)
 * so the returned promise is guaranteed to settle within `timeoutMs`.
 *
 * This is the single shared fix for useFormStatus / useActionState / useTransition
 * pending flags, which React only clears when the promise settles.
 */
export function wrapServerAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => TResult | Promise<TResult>,
  options: WrapServerActionOptions = {}
): (...args: TArgs) => Promise<TResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;
  const label = options.label ?? "Action";

  return async (...args: TArgs): Promise<TResult> => {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    markActionStart(label, token);
    try {
      const result = await raceWithTimeout(Promise.resolve(action(...args)), timeoutMs, label);
      markActionEnd(label, { ok: true, phase: "settled", panel: "shared" }, token);
      return result;
    } catch (error) {
      markActionEnd(
        label,
        {
          ok: false,
          phase: "settled",
          panel: "shared",
          error: error instanceof Error ? error.message : String(error)
        },
        token
      );
      throw error;
    }
  };
}

export type UseAsyncActionOptions = {
  timeoutMs?: number;
  label?: string;
};

export type UseAsyncActionResult = {
  status: AsyncActionStatus;
  pending: boolean;
  error: string | null;
  /**
   * Run an async fn with instant pending feedback, timeout racing, finally reset,
   * and stale-response suppression (only the latest in-flight call may update state).
   */
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  reset: () => void;
  setStatus: (status: AsyncActionStatus) => void;
};

/**
 * Client-side async action state machine for fetch / mutation buttons that own
 * their own pending flag (not React useFormStatus / useActionState).
 */
export function useAsyncAction(options: UseAsyncActionOptions = {}): UseAsyncActionResult {
  const timeoutMs = options.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;
  const label = options.label ?? "Action";
  const [status, setStatus] = useState<AsyncActionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      const requestId = ++requestIdRef.current;
      setStatus("loading");
      setError(null);

      const isCurrent = () => isMountedRef.current && requestIdRef.current === requestId;

      try {
        const result = await raceWithTimeout(Promise.resolve(fn()), timeoutMs, label);
        if (isCurrent()) {
          setStatus("success");
        }
        return result;
      } catch (err) {
        if (isCurrent()) {
          const message =
            err instanceof ActionTimeoutError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Something went wrong.";
          setError(message);
          setStatus("error");
        }
        throw err;
      } finally {
        if (isCurrent() && requestIdRef.current === requestId) {
          // Leave success/error as terminal status; only force-reset loading if still loading
          // (e.g. uncaught path). Callers that want idle after success call reset().
          setStatus((prev) => (prev === "loading" ? "idle" : prev));
        }
      }
    },
    [timeoutMs, label]
  );

  return {
    status,
    pending: status === "loading",
    error,
    run,
    reset,
    setStatus
  };
}

/** @deprecated Prefer useAsyncAction — kept as a thin alias during migration. */
export type AsyncStatus = AsyncActionStatus;
