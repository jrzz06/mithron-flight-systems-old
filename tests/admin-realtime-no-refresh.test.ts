import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN_MUTATION_FILES = [
  "components/admin/inventory-action-bridge.tsx",
  "components/admin/admin-orders-optimistic.tsx",
  "components/admin/orders/admin-order-shipping-section.tsx",
  "components/admin/admin-orders-workspace.tsx",
  "components/admin/admin-suppliers-directory.tsx",
  "components/admin/create-user-form.tsx"
] as const;

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin realtime no refresh", () => {
  it.each(ADMIN_MUTATION_FILES)("does not call router.refresh() in %s", (path) => {
    const source = readWorkspaceFile(path);
    expect(source).not.toMatch(/router\.refresh\s*\(/);
  });
});
