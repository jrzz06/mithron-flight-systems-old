import type { Page } from "@playwright/test";

export type ActionPerfSample = {
  id: string;
  panel: "customer" | "admin" | "warehouse" | "supplier";
  action: string;
  pendingMs: number;
  settledMs: number;
  ok: boolean;
  hung: boolean;
  notes?: string;
};

export type MeasureActionOptions = {
  id: string;
  panel: ActionPerfSample["panel"];
  action: string;
  /** Click the trigger (button/link). */
  click: () => Promise<void>;
  /** Selector that indicates pending/loading feedback appeared. */
  pendingSelector?: string;
  /** Selector that indicates success/settled state. */
  successSelector?: string;
  /** Max wait for pending feedback (budget: 100ms). */
  pendingTimeoutMs?: number;
  /** Max wait for settle (hard ceiling 2s for most actions). */
  settleTimeoutMs?: number;
};

/**
 * Measure click → visual pending feedback and click → settled outcome.
 */
export async function measureAction(page: Page, options: MeasureActionOptions): Promise<ActionPerfSample> {
  const pendingTimeoutMs = options.pendingTimeoutMs ?? 500;
  const settleTimeoutMs = options.settleTimeoutMs ?? 15_000;
  const started = Date.now();
  let pendingMs = -1;
  let hung = false;
  let ok = true;
  let notes: string | undefined;

  const pendingPromise = options.pendingSelector
    ? page
        .locator(options.pendingSelector)
        .first()
        .waitFor({ state: "visible", timeout: pendingTimeoutMs })
        .then(() => {
          pendingMs = Date.now() - started;
        })
        .catch(() => {
          pendingMs = -1;
          notes = "pending feedback not observed within timeout";
        })
    : Promise.resolve();

  await options.click();
  await pendingPromise;

  if (options.successSelector) {
    try {
      await page.locator(options.successSelector).first().waitFor({ state: "visible", timeout: settleTimeoutMs });
    } catch {
      ok = false;
      hung = true;
      notes = (notes ? `${notes}; ` : "") + "success selector not reached (possible hang)";
    }
  }

  const settledMs = Date.now() - started;
  if (settledMs >= settleTimeoutMs - 50) hung = true;

  return {
    id: options.id,
    panel: options.panel,
    action: options.action,
    pendingMs,
    settledMs,
    ok,
    hung,
    notes
  };
}

export async function measureNavigation(
  page: Page,
  input: {
    id: string;
    panel: ActionPerfSample["panel"];
    action: string;
    url: string;
    readySelector: string;
    timeoutMs?: number;
  }
): Promise<ActionPerfSample> {
  const timeoutMs = input.timeoutMs ?? 30_000;
  const started = Date.now();
  let ok = true;
  let hung = false;
  try {
    await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator(input.readySelector).first().waitFor({ state: "visible", timeout: timeoutMs });
  } catch (error) {
    ok = false;
    hung = true;
    return {
      id: input.id,
      panel: input.panel,
      action: input.action,
      pendingMs: -1,
      settledMs: Date.now() - started,
      ok,
      hung,
      notes: error instanceof Error ? error.message : String(error)
    };
  }
  return {
    id: input.id,
    panel: input.panel,
    action: input.action,
    pendingMs: -1,
    settledMs: Date.now() - started,
    ok,
    hung
  };
}

export function percentile(values: number[], p: number) {
  if (!values.length) return -1;
  const sorted = [...values].filter((v) => v >= 0).sort((a, b) => a - b);
  if (!sorted.length) return -1;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}
