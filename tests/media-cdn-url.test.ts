import { describe, expect, it } from "vitest";
import {
  getMediaCdnOrigin,
  isTrustedCatalogStorageSrc,
  readMediaCdnPublicEnv,
  rewriteStorageUrlForCdn,
  unwrapCdnStorageUrl
} from "@/lib/media/cdn-url";
import { buildResponsiveImageModel } from "@/lib/media/responsive-image-model";

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
    expect(rewritten).toBe("/cdn-media/storage/v1/object/public/mithron-products/foo.webp");
    expect(getMediaCdnOrigin({
      NEXT_PUBLIC_SITE_URL: "https://final-mithron-deploy.vercel.app",
      NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL: "1"
    })).toBe("https://final-mithron-deploy.vercel.app/cdn-media");
  });

  it("auto-enables relative /cdn-media without VERCEL or an explicit flag", () => {
    const src = "https://abc.supabase.co/storage/v1/object/public/mithron-products/foo.webp";
    expect(rewriteStorageUrlForCdn(src, {
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co"
    })).toBe("/cdn-media/storage/v1/object/public/mithron-products/foo.webp");
  });

  it("keeps direct Supabase URLs when via-vercel is explicitly disabled", () => {
    const src = "https://abc.supabase.co/storage/v1/object/public/mithron-products/foo.webp";
    expect(rewriteStorageUrlForCdn(src, {
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL: "0"
    })).toBe(src);
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

  it("rewrites *.supabase.co storage URLs even when the env bag omits NEXT_PUBLIC_SUPABASE_URL", () => {
    const src = "https://abc.supabase.co/storage/v1/object/public/mithron-products/foo.webp";
    // Client bundles may not inline env into a passed bag; pattern rewrite must still match SSR.
    expect(rewriteStorageUrlForCdn(src, {})).toBe(
      "/cdn-media/storage/v1/object/public/mithron-products/foo.webp"
    );
  });

  it("readMediaCdnPublicEnv exposes the static NEXT_PUBLIC keys used by rewrites", () => {
    const env = readMediaCdnPublicEnv();
    expect(env).toHaveProperty("NEXT_PUBLIC_SUPABASE_URL");
    expect(env).toHaveProperty("NEXT_PUBLIC_MEDIA_CDN_ORIGIN");
    expect(env).toHaveProperty("NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL");
    expect(env).toHaveProperty("NEXT_PUBLIC_SITE_URL");
  });
});

describe("hero image model CDN/native parity", () => {
  it("treats /cdn-media delivery without variants as native remote (same as https)", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousFlag = process.env.NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL = "1";
    try {
      const supabaseSrc =
        "https://example.supabase.co/storage/v1/object/public/mithron-hero/storefront/hero-slide-01-3840w.webp";
      const model = buildResponsiveImageModel({
        src: supabaseSrc,
        imageRole: "hero"
      });
      expect(model.primarySrc).toBe(
        "/cdn-media/storage/v1/object/public/mithron-hero/storefront/hero-slide-01-3840w.webp"
      );
      expect(model.mode).toBe("remote");
      expect(model.useNativeRemoteImage).toBe(true);
      expect(model.assetId).toBe("remote");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
      if (previousFlag === undefined) delete process.env.NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL;
      else process.env.NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL = previousFlag;
    }
  });
});

describe("isTrustedCatalogStorageSrc", () => {
  const vercelEnv = {
    NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
    NEXT_PUBLIC_SITE_URL: "https://final-mithron-deploy.vercel.app",
    NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL: "1"
  };

  it("accepts direct Supabase storage URLs", () => {
    expect(isTrustedCatalogStorageSrc(
      "https://abc.supabase.co/storage/v1/object/public/mithron-products/foo.webp"
    )).toBe(true);
  });

  it("accepts Vercel /cdn-media rewritten storage URLs", () => {
    const relativeCdnSrc = "/cdn-media/storage/v1/object/public/mithron-products/catalog-cutouts/v1/5-liter-agri-drone.webp";
    const absoluteCdnSrc = "https://final-mithron-deploy.vercel.app/cdn-media/storage/v1/object/public/mithron-products/catalog-cutouts/v1/5-liter-agri-drone.webp";
    expect(isTrustedCatalogStorageSrc(relativeCdnSrc, vercelEnv)).toBe(true);
    expect(isTrustedCatalogStorageSrc(absoluteCdnSrc, vercelEnv)).toBe(true);
    expect(isTrustedCatalogStorageSrc(relativeCdnSrc)).toBe(true);
  });

  it("accepts custom CDN origin rewritten storage URLs", () => {
    const cdnSrc = "https://media.mithron.com/storage/v1/object/public/mithron-products/foo.webp";
    expect(isTrustedCatalogStorageSrc(cdnSrc, {
      NEXT_PUBLIC_MEDIA_CDN_ORIGIN: "https://media.mithron.com"
    })).toBe(true);
  });

  it("rejects external non-storage URLs", () => {
    expect(isTrustedCatalogStorageSrc("https://static.wixstatic.com/media/foo.jpg")).toBe(false);
    expect(isTrustedCatalogStorageSrc("https://example.com/cdn-media/not-storage/foo.webp")).toBe(false);
  });
});

describe("unwrapCdnStorageUrl", () => {
  it("converts relative and absolute /cdn-media URLs back to Supabase", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" };
    const storagePath = "/storage/v1/object/public/mithron-products/foo.webp";
    expect(unwrapCdnStorageUrl(`/cdn-media${storagePath}`, env)).toBe(`https://abc.supabase.co${storagePath}`);
    expect(unwrapCdnStorageUrl(`https://final-mithron-deploy.vercel.app/cdn-media${storagePath}`, env)).toBe(
      `https://abc.supabase.co${storagePath}`
    );
  });
});
