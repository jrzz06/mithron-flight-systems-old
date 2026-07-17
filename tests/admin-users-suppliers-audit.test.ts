import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapUserGovernanceActivity } from "@/services/admin";

describe("admin suppliers directory", () => {
  it("loads supplier listings from live profile and role joins instead of raw UUID cards", () => {
    const suppliersPage = readFileSync(join(process.cwd(), "app/admin/suppliers/page.tsx"), "utf8");
    const suppliersDirectory = readFileSync(join(process.cwd(), "components/admin/admin-suppliers-directory.tsx"), "utf8");
    const adminService = readFileSync(join(process.cwd(), "services/admin.ts"), "utf8");

    expect(suppliersPage).toContain("getAdminSuppliersSnapshot");
    expect(suppliersPage).toContain("AdminSuppliersDirectory");
    expect(suppliersPage).toContain("AdminSuppliersDirectoryLiveSync");
    expect(suppliersDirectory).toContain("data-supplier-id");
    expect(suppliersDirectory).toContain("supplier.name");
    expect(suppliersDirectory).toContain("supplier.company");
    expect(suppliersDirectory).toContain("supplier.email");
    expect(suppliersDirectory).toContain("supplier.phone");
    expect(suppliersDirectory).toContain("supplier.verificationStatus");
    expect(suppliersDirectory).toContain("useOptimistic");
    expect(adminService).toContain("getAdminSuppliersSnapshot");
    expect(adminService).toContain("supplierDirectoryQueries");
    expect(adminService).toContain("listGovernanceAuthUsers");
  });

  it("returns supplier governance action state instead of redirecting", () => {
    const supplierActions = readFileSync(join(process.cwd(), "app/admin/suppliers/actions.ts"), "utf8");
    expect(supplierActions).toContain("revalidateAfterMutation");
    expect(supplierActions).toContain("SupplierActionState");
    expect(supplierActions).not.toContain("redirect(");
  });
});

describe("user governance activity feed", () => {
  it("maps audit log rows into operator-readable activity entries", () => {
    const activity = mapUserGovernanceActivity(
      [
        {
          id: "log-1",
          actor_id: "actor-1",
          action: "users.role_assign",
          entity_table: "user_roles",
          entity_id: "role-row-1",
          created_at: "2026-06-25T10:00:00.000Z",
          metadata: {
            target_user_id: "target-1",
            after_state: { user_id: "target-1", role_key: "supplier" }
          }
        },
        {
          id: "log-2",
          actor_id: "target-1",
          action: "auth.login",
          entity_table: "auth",
          entity_id: "target-1",
          created_at: "2026-06-25T09:30:00.000Z",
          metadata: {}
        }
      ],
      [
        {
          id: "actor-1",
          email: "admin@mithron.test",
          display_name: "Admin Operator",
          default_role: "admin",
          roles: ["admin"],
          status: "active",
          created_at: "2026-01-01T00:00:00.000Z",
          last_sign_in_at: null,
          banned_until: null
        },
        {
          id: "target-1",
          email: "supplier@acme.test",
          display_name: "Acme Supplier",
          default_role: "supplier",
          roles: ["supplier"],
          status: "active",
          created_at: "2026-02-01T00:00:00.000Z",
          last_sign_in_at: "2026-06-25T09:30:00.000Z",
          banned_until: null
        }
      ]
    );

    expect(activity[0]?.actionLabel).toBe("Changed role");
    expect(activity[0]?.actorName).toBe("Admin Operator");
    expect(activity[0]?.targetLabel).toBe("Acme Supplier");
    expect(activity[1]?.actionLabel).toBe("Signed in");
    expect(activity[1]?.targetLabel).toBe("supplier@acme.test");
  });
});
