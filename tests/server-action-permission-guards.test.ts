import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("server action permission guards", () => {
  it("requires orders.lifecycle for warehouse actions", () => {
    const warehouse = source("app/warehouse/actions.ts");
    expect(warehouse).toContain('requirePermission("orders.lifecycle")');
    expect(warehouse).toContain("receiveWarehouseOrderFormAction");
    expect(warehouse).toContain("cancelWarehouseOrderFormAction");
  });

  it("requires admin role for privileged admin server actions", () => {
    expect(source("app/admin/enquiries/actions.ts")).toContain("requireAdminPermission");
    expect(source("app/admin/products/actions.ts")).toContain("requirePermission");
    expect(source("app/admin/orders/actions.ts")).toContain("requireAdminPermission");
    expect(source("app/operations/actions.ts")).toContain("requireAdminPermission");
    expect(source("app/admin/cms/actions.ts")).toContain("requireAdminPermission");
  });

  it("requires cms.write for CMS form mutations", () => {
    const cms = source("app/admin/cms/actions.ts");
    expect(cms).toContain('requirePermission("cms.write")');
  });

  it("requires admin operations permission for operations actions", () => {
    const operations = source("app/operations/actions.ts");
    expect(operations).toContain('requireAdminPermission("operations.write")');
  });

  it("requires products.write for product admin actions", () => {
    const products = source("app/admin/products/actions.ts");
    expect(products).toContain('requirePermission("products.write")');
  });

  it("blocks stub payment webhooks on deployed environments", () => {
    const webhookRoute = source("app/api/payments/webhooks/[provider]/route.ts");
    expect(webhookRoute).toContain("isInternetDeployedEnvironment");
    expect(webhookRoute).toContain("safeSecretEquals");
  });
});
