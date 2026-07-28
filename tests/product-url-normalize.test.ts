import { describe, expect, it } from "vitest";
import {
  extractProductSlugFromUrl,
  isLegacyOrForeignProductUrl,
  productPathFromSlug,
  resolveCanonicalProductPath
} from "@/lib/catalog/product-url";
import { toAbsoluteUrl } from "@/lib/site-url";

describe("product URL normalization", () => {
  it("builds canonical /product/{slug} paths", () => {
    expect(productPathFromSlug("agri-x1")).toBe("/product/agri-x1");
    expect(productPathFromSlug("/product/agri-x1")).toBe("/product/agri-x1");
    expect(productPathFromSlug("product-page/legacy-item")).toBe("/product/legacy-item");
  });

  it("extracts slugs from legacy Wix and absolute URLs", () => {
    expect(extractProductSlugFromUrl("https://www.mithron.co/product-page/agri-kit")).toBe("agri-kit");
    expect(extractProductSlugFromUrl("/product/agri-kit")).toBe("agri-kit");
    expect(extractProductSlugFromUrl("https://example.com/product/agri-kit?x=1")).toBe("agri-kit");
  });

  it("always prefers slug for canonical path", () => {
    expect(
      resolveCanonicalProductPath({
        slug: "new-slug",
        productUrl: "https://www.mithron.co/product-page/old-slug"
      })
    ).toBe("/product/new-slug");
  });

  it("flags legacy and foreign product URLs", () => {
    expect(isLegacyOrForeignProductUrl("https://www.mithron.co/product-page/x")).toBe(true);
    expect(isLegacyOrForeignProductUrl("/product-page/x")).toBe(true);
    expect(isLegacyOrForeignProductUrl("/product/x")).toBe(false);
    expect(isLegacyOrForeignProductUrl(null)).toBe(true);
  });

  it("rehosts absolute URLs onto the site origin without double-prefixing", () => {
    const env = { NEXT_PUBLIC_SITE_URL: "https://final-mithron-deploy.vercel.app" };
    expect(toAbsoluteUrl("/product/agri-x1", env)).toBe(
      "https://final-mithron-deploy.vercel.app/product/agri-x1"
    );
    expect(toAbsoluteUrl("https://www.mithron.co/product-page/agri-x1", env)).toBe(
      "https://final-mithron-deploy.vercel.app/product/agri-x1"
    );
    expect(toAbsoluteUrl("https://evil.example/product/agri-x1", env)).toBe(
      "https://final-mithron-deploy.vercel.app/product/agri-x1"
    );
  });
});
