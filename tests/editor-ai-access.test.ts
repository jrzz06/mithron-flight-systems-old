import { describe, expect, it } from "vitest";
import { buildEditorAiUserPrompt, productDescriptionAiActions } from "@/lib/editor/ai-prompts";
import { roleHasAnyPermission } from "@/lib/auth/permissions";
import { htmlToEditorDocument } from "@/lib/editor/serialize";

describe("editor AI access", () => {
  it("allows admin, supplier submit, and cms writers to use editor AI", () => {
    expect(roleHasAnyPermission("admin", ["cms.write", "products.write", "products.submit"])).toBe(true);
    expect(roleHasAnyPermission("supplier", ["cms.write", "products.write", "products.submit"])).toBe(true);
    expect(roleHasAnyPermission("warehouse", ["cms.write", "products.write", "products.submit"])).toBe(false);
  });

  it("exposes product-specific normalize action", () => {
    const actions = productDescriptionAiActions();
    expect(actions[0]?.id).toBe("normalize_structure");
    expect(buildEditorAiUserPrompt({
      action: "normalize_structure",
      text: "Battery: 22000 mAh"
    })).toContain("Preserve every fact");
  });

  it("uses product prompts for supplier descriptions", async () => {
    const { buildEditorAiSystemPrompt } = await import("@/lib/editor/ai-prompts");
    expect(buildEditorAiSystemPrompt("supplier_product_description")).toContain("Never invent SKUs");
  });

  it("loads normalized description html into structured editor blocks", () => {
    const doc = htmlToEditorDocument(
      "<p><strong>Battery:</strong> 30,000 mAh</p><p><strong>Flight Time:</strong> 28 min</p>"
    );
    expect(doc.content?.length).toBeGreaterThan(1);
  });
});
