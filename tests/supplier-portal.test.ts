import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("supplier portal workflow", () => {
  it("exposes supplier product submission routes and actions", () => {
    for (const route of [
      "app/supplier/page.tsx",
      "app/supplier/products/page.tsx",
      "app/supplier/products/new/page.tsx",
      "app/supplier/products/actions.ts",
      "services/supplier-actions.ts"
    ]) {
      expect(existsSync(join(root, route))).toBe(true);
    }

    const actions = readFileSync(join(root, "app/supplier/products/actions.ts"), "utf8");
    const supplierActions = readFileSync(join(root, "services/supplier-actions.ts"), "utf8");
    expect(actions).toContain("submitSupplierProductFormAction");
    expect(actions).toContain("requirePermission(\"products.submit\")");
    expect(actions).toContain("createSupplierProductFormStateAction");
    expect(actions).toContain("parseSupplierProductForm");
    expect(supplierActions).toContain("products.submit");
    expect(supplierActions).toContain("supplierProductMutationOptions");
  });

  it("exposes admin approval queue for pending supplier products", () => {
    const approvalActions = readFileSync(join(root, "app/admin/suppliers/products/actions.ts"), "utf8");
    const approvalPage = readFileSync(join(root, "app/admin/suppliers/products/page.tsx"), "utf8");
    expect(approvalActions).toContain("approveProductSubmissionFormAction");
    expect(approvalActions).toContain("rejectProductSubmissionFormAction");
    expect(approvalPage).toContain("pending_review");
    expect(approvalPage).toContain("supplier_label");
  });

  it("mounts supplier feedback dialog and toast bridge in supplier shell", () => {
    const supplierLayout = readFileSync(join(root, "app/supplier/layout.tsx"), "utf8");
    expect(existsSync(join(root, "components/supplier/supplier-feedback-dialog.tsx"))).toBe(true);
    expect(supplierLayout).toContain("SupplierFeedbackDialog");
    expect(supplierLayout).toContain("ControlPlaneParallelLayout");
    expect(supplierLayout).toContain("data-supplier-frame");
    expect(supplierLayout).toContain("getCurrentAuthContext");
  });

  it("uses session handoff in supplier @shell chrome (H13)", () => {
    const shell = readFileSync(join(root, "app/supplier/@shell/default.tsx"), "utf8");
    expect(shell).toContain("readSessionHandoff");
    expect(shell).toContain("getCurrentAuthContext");
  });

  it("keeps storefront catalog limited to published products", () => {
    const catalog = readFileSync(join(root, "services/catalog.ts"), "utf8");
    expect(catalog).toContain("published");
    expect(catalog).toContain("is_visible");
  });
});
