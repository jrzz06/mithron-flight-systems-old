import { describe, expect, it } from "vitest";
import { getMediaCdnOrigin, rewriteStorageUrlForCdn } from "@/lib/media/cdn-url";

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

  it("uses Vercel edge /cdn-media path when via-vercel is enabled", () => {
    const src = "https://abc.supabase.co/storage/v1/object/public/mithron-products/foo.webp";
    const rewritten = rewriteStorageUrlForCdn(src, {
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SITE_URL: "https://final-mithron-deploy.vercel.app",
      NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL: "1"
    });
    expect(rewritten).toBe(
      "https://final-mithron-deploy.vercel.app/cdn-media/storage/v1/object/public/mithron-products/foo.webp"
    );
    expect(getMediaCdnOrigin({
      NEXT_PUBLIC_SITE_URL: "https://final-mithron-deploy.vercel.app",
      NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL: "1"
    })).toBe("https://final-mithron-deploy.vercel.app/cdn-media");
  });

  it("prefers custom CDN over Vercel edge mode", () => {
    const src = "https://abc.supabase.co/storage/v1/object/public/mithron-products/foo.webp";
    const rewritten = rewriteStorageUrlForCdn(src, {
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_MEDIA_CDN_ORIGIN: "https://media.mithron.com",
      NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL: "1",
      NEXT_PUBLIC_SITE_URL: "https://final-mithron-deploy.vercel.app"
    });
    expect(rewritten).toBe("https://media.mithron.com/storage/v1/object/public/mithron-products/foo.webp");
  });
});
