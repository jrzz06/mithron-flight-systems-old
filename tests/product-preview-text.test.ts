import { describe, expect, it } from "vitest";
import { clipProductPreviewText, sanitizeProductPreviewText } from "@/lib/product-preview-text";
import { getProductMarketingTagline } from "@/lib/product-marketing-copy";

describe("product preview text", () => {
  it("decodes escaped html and strips tags from catalog card descriptions", () => {
    expect(sanitizeProductPreviewText("4K drone&lt;br&gt;with controller")).toBe("4K drone with controller");
    expect(sanitizeProductPreviewText("Thermal <strong>inspection</strong> platform")).toBe("Thermal inspection platform");
    expect(sanitizeProductPreviewText("Sweet Air Time (Total) With OA - 96 mins&lt;br&")).toBe("Sweet Air Time (Total) With OA - 96 mins");
  });

  it("clips long preview copy with an ellipsis", () => {
    const value = "A".repeat(150);
    expect(clipProductPreviewText(value, 132)).toMatch(/\.\.\.$/);
    expect(clipProductPreviewText(value, 132).length).toBeLessThanOrEqual(135);
  });

  it("strips quantity-discount CMS placeholder notes", () => {
    expect(sanitizeProductPreviewText("( MORE NUMBER QUANTITIES WILL HAVE A DISCOUNT)")).toBe("");
    expect(
      sanitizeProductPreviewText("Mission motors. ( MORE NUMBER QUANTITIES WILL HAVE A DISCOUNT)")
    ).toBe("Mission motors.");
  });
});

describe("product marketing tagline", () => {
  it("falls back when tagline is a quantity-discount placeholder", () => {
    const tagline = getProductMarketingTagline({
      name: "SOURCE 8008SL 110KV",
      category: "Accessories",
      tagline: "( MORE NUMBER QUANTITIES WILL HAVE A DISCOUNT)"
    });
    expect(tagline.toLowerCase()).not.toContain("more number");
    expect(tagline.toLowerCase()).not.toContain("discount");
  });
});
