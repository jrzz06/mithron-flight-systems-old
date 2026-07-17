import { describe, expect, it } from "vitest";
import { isNextImageRenderableSrc, resolveNextImageSrc } from "@/lib/media/next-image-src";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://ictnoydmxlywwxwnugal.supabase.co"
};

describe("next-image-src", () => {
  it("accepts local media paths and image extensions", () => {
    expect(isNextImageRenderableSrc("/media/mithron/hero/ag10-command.webp", env)).toBe(true);
    expect(isNextImageRenderableSrc("/assets/logo.png", env)).toBe(true);
    expect(isNextImageRenderableSrc("/optimized/catalog/item.jpg", env)).toBe(true);
  });

  it("rejects page routes and localhost URLs stored as image src", () => {
    expect(isNextImageRenderableSrc("/surveillance", env)).toBe(false);
    expect(isNextImageRenderableSrc("http://127.0.0.1:3000/surveillance", env)).toBe(false);
    expect(isNextImageRenderableSrc("/admin/products", env)).toBe(false);
  });

  it("accepts supabase storage image URLs", () => {
    expect(
      isNextImageRenderableSrc(
        "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/media/products/item.webp",
        env
      )
    ).toBe(true);
  });

  it("rejects legacy wix CDN URLs after migration", () => {
    expect(
      isNextImageRenderableSrc("https://static.wixstatic.com/media/abc123~mv2.jpg", env)
    ).toBe(false);
  });

  it("resolveNextImageSrc returns null for invalid values", () => {
    expect(resolveNextImageSrc("/surveillance", env)).toBeNull();
    expect(resolveNextImageSrc("/media/item.webp", env)).toBe("/media/item.webp");
  });
});
