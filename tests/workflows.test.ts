import { describe, expect, it } from "vitest";
import { ROLE_WORKFLOWS, allWorkflowPages, canTransition, getRoleWorkflow } from "@/lib/workflows";

describe("workflow registry", () => {
  it("defines all four enterprise roles", () => {
    expect(Object.keys(ROLE_WORKFLOWS).sort()).toEqual(["admin", "supplier", "user", "warehouse"]);
  });

  it("connects customer browse-to-review pages without dead ends", () => {
    const customer = getRoleWorkflow("user");
    const paths = customer.pages.map((page) => page.path);
    expect(paths).toContain("/track-order");
    expect(paths).toContain("/checkout");
    expect(paths).toContain("/account/orders");
    expect(customer.actions.some((action) => action.id === "review.submit")).toBe(true);
  });

  it("defines supplier submission and order visibility pages", () => {
    const supplier = getRoleWorkflow("supplier");
    const paths = supplier.pages.map((page) => page.path);
    expect(paths).toContain("/supplier/submissions");
    expect(paths).toContain("/supplier/inventory");
  });

  it("defines warehouse allocate step in fulfillment machine", () => {
    const warehouse = getRoleWorkflow("warehouse");
    const paths = warehouse.pages.map((page) => page.path);
    expect(paths).toContain("/warehouse/allocate");
    expect(paths).not.toContain("/warehouse/returns");
    const fulfillment = warehouse.stateMachines.fulfillment;
    expect(fulfillment.transitions.some((t) => t.from === "pending" && t.to === "processing")).toBe(true);
  });

  it("enforces supplier product approval transitions", () => {
    expect(canTransition("supplier_product", "pending_review", "published", "admin")).toBe(true);
    expect(canTransition("supplier_product", "pending_review", "published", "supplier")).toBe(false);
  });

  it("lists pages for every role", () => {
    const pages = allWorkflowPages();
    expect(pages.length).toBeGreaterThan(20);
    expect(new Set(pages.map((page) => page.role)).size).toBe(4);
  });
});
