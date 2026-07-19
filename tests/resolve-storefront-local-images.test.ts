import { describe, expect, it } from "vitest";
import { getResponsiveAssetForSrc } from "@/config/generated-assets";
import {
  canonicalStorefrontPath,
  getStorefrontResponsiveAsset,
  resolveHeroSlideSrc,
  resolveStorefrontSrc
} from "@/lib/media/resolve-storefront-src";

describe("storefront local image resolution", () => {
  it("canonicalizes legacy hero png cms paths to enhanced webp masters", () => {
    expect(canonicalStorefrontPath("/assets/hero/hero-slide-01.png")).toBe("/assets/hero/hero-slide-01.webp");
    expect(canonicalStorefrontPath("/media/mithron/hero/ag10-command.webp")).toBe("/assets/hero/hero-slide-01.webp");
  });

  it("resolves hero slide ids to canonical webp paths", () => {
    expect(resolveHeroSlideSrc("/assets/hero/hero-slide-01.png", "ag10-arrival")).toMatch(
      /hero-slide-01/
    );
  });

  it("resolves optimized responsive variants for png and webp local master keys", () => {
    const fromPng = getResponsiveAssetForSrc("/assets/hero/hero-slide-01.png");
    const fromWebp = getResponsiveAssetForSrc("/assets/hero/hero-slide-01.webp");

    if (fromPng?.status === "generated") {
      expect(fromPng?.variants.webp?.at(-1)?.src).toMatch(/^https:\/\//);
    }
    if (fromWebp?.status === "generated") {
      expect(fromWebp?.variants.webp?.at(-1)?.src).toMatch(/^https:\/\//);
    }
  });

  it("resolves mission tile masters to Supabase delivery urls instead of missing local optimized files", () => {
    const agriOwner = "/media/mithron/mission/agrone/agrone-drone-owner-registration.png";
    const cityRental = "/media/mithron/mission/city/city-drone-rental-services-app.png";

    expect(resolveStorefrontSrc(agriOwner)).toMatch(/^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\//);
    expect(resolveStorefrontSrc(cityRental)).toMatch(/^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\//);
    expect(getStorefrontResponsiveAsset(agriOwner)?.variants.webp?.some((variant) => /enh-v1|restored-v1/.test(variant.src))).toBe(true);
    expect(getStorefrontResponsiveAsset(cityRental)?.variants.webp?.some((variant) => /enh-v1|restored-v1/.test(variant.src))).toBe(true);
  });
});
