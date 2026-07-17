import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("supplier new product form UX", () => {
  it("surfaces browser validation failures instead of silently locking submit buttons", () => {
    const form = readFileSync(join(process.cwd(), "components/supplier/supplier-new-product-form.tsx"), "utf8");
    const submitButton = readFileSync(join(process.cwd(), "components/admin/operational-submit-button.tsx"), "utf8");

    expect(form).toContain("onInvalid={handleInvalid}");
    expect(form).toContain('data-supplier-product-create-feedback="validation"');
    expect(form).toContain("SupplierFormDebugPanel");
    expect(form).toContain("SupplierProductImageField");
    expect(form).toContain("action={formAction}");
    expect(form).not.toContain('encType="multipart/form-data"');
    expect(submitButton).not.toContain("setClicked(true)");
    expect(submitButton).not.toContain("clickLockRef");
  });
});
