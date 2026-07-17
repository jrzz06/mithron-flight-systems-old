import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ENTERPRISE_ROLES,
  PermissionDeniedError,
  assertRolePermission,
  roleHasPermission
} from "@/lib/auth/permissions";
import {
  assertAdminMutationPermission,
  getRequiredPermissionForAdminTable
} from "@/services/admin-actions";
import {
  buildValidatedOrderDraft,
  type CheckoutOrderInput,
  type OrderCatalogProduct
} from "@/services/orders";
import {
  buildDeploymentRequestPayload,
  buildStaffTaskPayload,
  buildWarehouseStockAdjustment
} from "@/services/operations-actions";

const root = process.cwd();
const foundationMigrationPath = join(root, "supabase", "migrations", "20260524000100_enterprise_foundation_completion.sql");

describe("enterprise foundation completion", () => {
  it("defines the expanded enterprise role and permission matrix", () => {
    expect(ENTERPRISE_ROLES).toEqual([
      "admin",
      "warehouse",
      "supplier",
      "user"
    ]);

    expect(roleHasPermission("super_admin", "settings.write")).toBe(true);
    expect(roleHasPermission("admin", "products.write")).toBe(true);
    expect(roleHasPermission("warehouse", "warehouse.write")).toBe(true);
    expect(roleHasPermission("supplier", "products.submit")).toBe(true);
    expect(roleHasPermission("supplier", "products.write")).toBe(false);
    expect(roleHasPermission("warehouse_staff", "warehouse.write")).toBe(true);
    expect(roleHasPermission("warehouse", "cms.write")).toBe(false);
    expect(roleHasPermission("user", "orders.checkout")).toBe(true);
    expect(roleHasPermission("user", "orders.write")).toBe(false);
    expect(roleHasPermission("user", "payments.write")).toBe(true);
    expect(roleHasPermission("operations_manager", "orders.checkout")).toBe(true);
    expect(roleHasPermission("operations_manager", "orders.write")).toBe(false);
    expect(() => assertRolePermission("user", "cms.write")).toThrow(PermissionDeniedError);
  });

  it("keeps required auth and onboarding route surfaces present", () => {
    const expectedRoutes = [
      "app/signup/page.tsx",
      "app/forgot-password/page.tsx",
      "app/reset-password/page.tsx",
      "app/invite/[token]/page.tsx",
      "app/auth/logout/route.ts",
      "app/onboarding/page.tsx"
    ];

    for (const route of expectedRoutes) {
      expect(existsSync(join(root, route))).toBe(true);
    }
  });

  it("maps admin mutations to least-privilege server-side permission checks", async () => {
    expect(getRequiredPermissionForAdminTable("hero_banners")).toBe("cms.write");
    expect(getRequiredPermissionForAdminTable("mithron_products")).toBe("products.write");
    expect(getRequiredPermissionForAdminTable("media_assets")).toBe("media.write");
    expect(getRequiredPermissionForAdminTable("orders")).toBe("orders.lifecycle");
    expect(getRequiredPermissionForAdminTable("warehouse_stock")).toBe("warehouse.write");
    expect(getRequiredPermissionForAdminTable("staff_tasks")).toBe("operations.write");
    expect(getRequiredPermissionForAdminTable("activity_logs")).toBe("audit.read");

    const checked: string[] = [];
    await assertAdminMutationPermission("warehouse_stock", "actor-1", {
      guard: async (permission) => {
        checked.push(permission);
      }
    });
    expect(checked).toEqual(["warehouse.write"]);

    await expect(assertAdminMutationPermission("mithron_products", "actor-1", {
      guard: async () => {
        throw new PermissionDeniedError("Denied by test guard.");
      }
    })).rejects.toThrow("requires one of: products.write, products.submit");

    await assertAdminMutationPermission("mithron_products", "actor-1", {
      guard: async (permission) => {
        if (permission === "products.write") {
          throw new PermissionDeniedError("Role supplier cannot perform products.write.");
        }
      }
    });

    await assertAdminMutationPermission("product_media_assets", "actor-1", {
      guard: async (permission) => {
        if (permission === "products.write") {
          throw new PermissionDeniedError("Role supplier cannot perform products.write.");
        }
      }
    });

    await assertAdminMutationPermission("inventory", "actor-1", {
      guard: async (permission) => {
        if (permission === "products.write" || permission === "warehouse.write") {
          throw new PermissionDeniedError(`Role supplier cannot perform ${permission}.`);
        }
      }
    });

    await expect(assertAdminMutationPermission("inventory", "actor-1", {
      guard: async () => {
        throw new PermissionDeniedError("Denied by test guard.");
      }
    })).rejects.toThrow("requires one of: warehouse.write, products.write, products.submit, inventory.update_own");
  });

  it("builds secure checkout order drafts without changing product slugs", () => {
    const products: OrderCatalogProduct[] = [
      {
        slug: "source-agri-kisan-drone-small-8-liter",
        name: "Agri Kisan Drone Small",
        price: 120000,
        category: "Agri Drones",
        chargeTax: true,
        taxGroup: "agri-drones",
        taxRate: 5,
        taxIncluded: false
      }
    ];
    const input: CheckoutOrderInput = {
      customerEmail: "ops@example.com",
      region: "IN-WEST",
      items: [
        {
          productSlug: "source-agri-kisan-drone-small-8-liter",
          quantity: 2,
          bundleId: "source-listing"
        }
      ]
    };

    const draft = buildValidatedOrderDraft(input, products);

    expect(draft.order.customer_email).toBe("ops@example.com");
    expect(draft.order.status).toBe("draft");
    expect(draft.order.payment_status).toBe("not_required");
    expect(draft.order.fulfillment_status).toBe("pending");
    expect(draft.order.subtotal).toBe(240000);
    expect(draft.order.total).toBe(252000);
    expect(draft.order.metadata.tax_total).toBe(12000);
    expect(draft.orderItems[0]).toMatchObject({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      quantity: 2,
      unit_price: 120000,
      line_total: 252000
    });

    expect(() => buildValidatedOrderDraft({
      customerEmail: "ops@example.com",
      items: [{ productSlug: "unknown-product", quantity: 1 }]
    }, products)).toThrow("Unknown product slug");
  });

  it("normalizes warehouse and operations workflow payloads for audit-safe writes", () => {
    expect(buildWarehouseStockAdjustment({
      productSlug: "source-agri-kisan-drone-small-8-liter",
      warehouseCode: "IN-WEST",
      availableQuantity: 12,
      committedQuantity: 3,
      sku: "AGRI-8L"
    })).toMatchObject({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      warehouse_code: "IN-WEST",
      available_quantity: 12,
      committed_quantity: 3,
      sku: "AGRI-8L"
    });

    expect(() => buildWarehouseStockAdjustment({
      productSlug: "source-agri-kisan-drone-small-8-liter",
      warehouseCode: "IN-WEST",
      availableQuantity: -1
    })).toThrow("availableQuantity");

    expect(buildDeploymentRequestPayload({
      requesterEmail: "ops@example.com",
      region: "IN-WEST",
      missionProfile: "agriculture",
      notes: "Field deployment",
      priority: "high"
    })).toMatchObject({
      requester_email: "ops@example.com",
      region: "IN-WEST",
      mission_profile: "agriculture",
      status: "pending"
    });

    expect(buildStaffTaskPayload({
      title: "Verify stock count",
      body: "Count AG-8L inventory",
      priority: "high"
    })).toMatchObject({
      title: "Verify stock count",
      status: "open",
      priority: "high"
    });
  });

  it("adds an additive foundation migration for orders, notifications, invites, and activity logs", () => {
    expect(existsSync(foundationMigrationPath)).toBe(true);
    const sql = readFileSync(foundationMigrationPath, "utf8").toLowerCase();

    for (const table of ["order_items", "notifications", "activity_logs", "admin_invites"]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }

    for (const role of ["admin", "warehouse", "user"] as const) {
      expect(sql).toContain(`('${role}'`);
    }

    expect(sql).toContain("alter publication supabase_realtime add table public.notifications");
    expect(sql).toContain("create index if not exists order_items_order_idx");
    expect(sql).toContain("create index if not exists notifications_recipient_idx");
    expect(sql).toContain("create index if not exists activity_logs_actor_idx");
    expect(sql).toContain("create index if not exists admin_invites_token_idx");
  });
});
