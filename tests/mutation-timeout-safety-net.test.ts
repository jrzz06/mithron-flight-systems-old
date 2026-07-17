import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const SUPABASE_CLIENT_FACTORIES = [
  "lib/server.ts",
  "lib/client.ts",
  "proxy.ts",
  "app/auth/logout/route.ts"
] as const;

const SHARED_TIMEOUT_CONSUMERS = [
  "components/admin/inventory-action-bridge.tsx",
  "components/admin/timed-action-form.tsx",
  "components/admin/operational-action-panel.tsx",
  "app/(storefront)/account/profile/profile-form.tsx",
  "components/account/address-manager.tsx",
  "app/(storefront)/account/complete-profile/complete-profile-form.tsx",
  "app/(storefront)/account/security/security-panel.tsx",
  "app/(storefront)/account/profile/profile-security-panel.tsx",
  "app/login/login-form.tsx",
  "lib/cart/cart-actions.ts",
  "lib/admin/order-action-client.ts"
] as const;

describe("mutation timeout safety net", () => {
  it("wires supabaseFetch into every Supabase client factory", () => {
    for (const path of SUPABASE_CLIENT_FACTORIES) {
      const file = source(path);
      expect(file, path).toContain("supabaseFetch");
      expect(file, path).toMatch(/global:\s*\{[\s\S]*fetch:\s*supabaseFetch\(/);
    }
  });

  it("exports shared raceWithTimeout and ActionTimeoutError", () => {
    const fetchHelper = source("lib/fetch-with-timeout.ts");
    expect(fetchHelper).toContain("SUPABASE_FETCH_TIMEOUT_MS = 20_000");
    expect(fetchHelper).toContain("DEFAULT_ACTION_TIMEOUT_MS = 20_000");
    expect(fetchHelper).toContain("export function supabaseFetch");
    expect(fetchHelper).toContain("export async function raceWithTimeout");
    expect(fetchHelper).toContain("export class ActionTimeoutError");
  });

  it("exports wrapServerAction and useAsyncAction as the shared client pattern", () => {
    const hook = source("hooks/use-async-action.ts");
    expect(hook).toContain("export function wrapServerAction");
    expect(hook).toContain("export function useAsyncAction");
    expect(hook).toContain("raceWithTimeout");
  });

  it("does not leave bare fetch() calls in supplier-actions", () => {
    const supplier = source("services/supplier-actions.ts");
    expect(supplier).toContain("fetchWithTimeout");
    expect(supplier).not.toMatch(/\bawait fetch\(/);
    expect(supplier).not.toMatch(/\bconst response = await fetch\(/);
  });

  it("has retired the reload-only stuck-pending guard", () => {
    expect(existsSync(join(root, "hooks/use-stuck-pending-guard.ts"))).toBe(false);
    expect(existsSync(join(root, "hooks/use-async-status.ts"))).toBe(false);

    const operational = source("components/admin/operational-submit-button.tsx");
    expect(operational).not.toContain("useStuckPendingGuard");
    expect(operational).not.toContain("STUCK_PENDING_RECOVERY_LABEL");
    expect(operational).not.toContain("window.location.reload");

    const busy = source("components/ui/global-busy.tsx");
    expect(busy).not.toContain("STUCK_PENDING_TIMEOUT_MS");
    expect(busy).not.toContain("Taking longer than expected");
    expect(busy).not.toContain("window.location.reload");
  });

  it("keeps shared timeout wrappers wired into submit UX", () => {
    for (const path of SHARED_TIMEOUT_CONSUMERS) {
      const file = source(path);
      expect(
        file.includes("wrapServerAction")
          || file.includes("fetchWithTimeout")
          || file.includes("raceWithTimeout")
          || file.includes("useAsyncAction"),
        path
      ).toBe(true);
    }
  });

  it("throttles GlobalBusySpinner ticks and does not setState every 100ms", () => {
    const busy = source("components/ui/global-busy.tsx");
    expect(busy).toContain("PROGRESS_TICK_MS");
    expect(busy).not.toMatch(/setInterval\(\(\) => setNow\(Date\.now\(\)\), 100\)/);
    expect(busy).toContain("lastProgressRef");
  });

  it("memoizes inventory bridge form actions with raceWithTimeout so restock pending cannot thrash", () => {
    const bridge = source("components/admin/inventory-action-bridge.tsx");
    expect(bridge).toContain("wrappedRestock");
    expect(bridge).toContain("raceWithTimeout");
    expect(bridge).toMatch(/useMemo\(\s*\(\)\s*=>\s*wrapAction\(restockAction/);
    expect(bridge).not.toContain("restockAction={wrapAction(restockAction)}");
  });

  it("uses raceWithTimeout in inventory server actions", () => {
    const actions = source("app/admin/inventory/actions.ts");
    expect(actions).toContain("raceWithTimeout");
    expect(actions).not.toContain("withInventoryTimeout");
  });
});
