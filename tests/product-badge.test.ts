import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRODUCT_BADGE_TEXT_MAX,
  PRODUCT_BADGE_PRESETS,
  normalizeProductBadgeStyle,
  readProductBadgeFieldsFromFormData,
  resolveStorefrontProductBadge
} from "@/lib/product-badge";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("product badge helpers", () => {
  it("shows storefront badges only when badge_text is set", () => {
    expect(resolveStorefrontProductBadge({
      badge_text: null,
      badge_style: "success"
    })).toBeUndefined();

    expect(resolveStorefrontProductBadge({
      badge_text: "   ",
      badge_style: "success"
    })).toBeUndefined();

    expect(resolveStorefrontProductBadge({
      badge_text: "Best Seller",
      badge_style: "premium"
    })).toEqual({
      text: "Best Seller",
      style: "premium"
    });
  });

  it("ignores legacy badge column when badge_text is empty", () => {
    expect(resolveStorefrontProductBadge({
      badge: "New Arrival",
      badge_text: null,
      badge_style: "success"
    })).toBeUndefined();
  });

  it("normalizes invalid styles to default", () => {
    expect(normalizeProductBadgeStyle("PREMIUM")).toBe("premium");
    expect(normalizeProductBadgeStyle("invalid")).toBe("default");
  });

  it("validates admin badge form fields", () => {
    expect(readProductBadgeFieldsFromFormData(formData({
      badge_text: "Featured",
      badge_style: "success"
    }))).toEqual({
      badge_enabled: true,
      badge_text: "Featured",
      badge_style: "success",
      badge: "Featured"
    });

    expect(readProductBadgeFieldsFromFormData(formData({
      badge_text: "",
      badge_style: "default"
    }))).toEqual({
      badge_enabled: false,
      badge_text: null,
      badge_style: "default",
      badge: null
    });

    expect(() => readProductBadgeFieldsFromFormData(formData({
      badge_text: "x".repeat(PRODUCT_BADGE_TEXT_MAX + 1),
      badge_style: "default"
    }))).toThrow(`Ribbon text must be ${PRODUCT_BADGE_TEXT_MAX} characters or fewer.`);
  });

  it("keeps New preset as uppercase NEW on success style", () => {
    expect(PRODUCT_BADGE_PRESETS).toContainEqual({
      label: "New",
      text: "NEW",
      style: "success"
    });
  });

  it("uses soft-rounded top-left ribbon geometry without shadow", () => {
    const ribbonCss = source("components/product/product-ribbon.module.css");
    const globals = source("app/globals.css");
    const adminFields = source("components/admin/product-badge-fields.tsx");

    expect(ribbonCss).toContain("top: 0");
    expect(ribbonCss).toContain("left: 0");
    expect(ribbonCss).toContain("border-radius: 6px");
    expect(ribbonCss).toContain("max-width: 70%");
    expect(ribbonCss).toContain("box-shadow: none");
    expect(ribbonCss).not.toContain("border-radius: 9999px");

    expect(globals).toContain("background: #fef2f2");
    expect(globals).toContain("color: #e11d2e");
    expect(globals).toContain("background: #ff6b6b");
    expect(globals).toContain("background: #ecfdf5");
    expect(globals).toContain("color: #1f6b46");

    expect(adminFields).toContain("product-badge-preview");
    expect(adminFields).toContain("productBadgeCssClass");
  });
});
