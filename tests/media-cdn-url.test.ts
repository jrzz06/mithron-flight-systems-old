import { describe, expect, it } from "vitest";
import { rewriteStorageUrlForCdn } from "@/lib/media/cdn-url";

describe("media CDN rewrite", () => {
  it("rewrites Supabase storage URLs to the configured CDN origin", () => {
    const src = "https://abc.supabase.co/storage/v1/object/public/mithron-products/foo.webp";
    const rewritten = rewriteStorageUrlForCdn(src, {
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_MEDIA_CDN_ORIGIN: "https://media.mithron.com"
    });
    expect(rewritten).toBe("https://media.mithron.com/storage/v1/object/public/mithron-products/foo.webp");
  });

  it("leaves non-storage URLs unchanged", () => {
    const src = "https://media.gettyimages.com/foo.jpg";
    expect(rewriteStorageUrlForCdn(src, {
      NEXT_PUBLIC_MEDIA_CDN_ORIGIN: "https://media.mithron.com"
    })).toBe(src);
  });
});
