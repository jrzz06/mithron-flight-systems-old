// static.wixstatic.com
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { MithronMissionTileImage } from "@/components/media/mithron-mission-tile-image";
import { MithronPageHeroImage } from "@/components/media/mithron-page-hero-image";
import { MithronThumbImage } from "@/components/media/mithron-thumb-image";
import { MithronResponsiveImage } from "@/components/media/mithron-responsive-image";
import { getBestVariantUpToWidth, getGeneratedAssetCoverage, getResponsiveAssetForSrc } from "@/config/generated-assets";
import { hydrateDefaultStorefrontMedia } from "@/config/products-hydration";
import { getCriticalMediaManifest } from "@/config/media";
import { heroSlides, interests } from "@/config/products";
import { getProductBySlug, getProducts } from "@/services/catalog";

hydrateDefaultStorefrontMedia();

const supabaseStoragePrefix = "/storage/v1/object/public/mithron-products/";

async function collectStorefrontAssets() {
  const products = await getProducts();
  const assets = [
    ...heroSlides.flatMap((slide) => [slide.image, slide.poster]),
    ...interests.map((interest) => interest.image),
    ...products.flatMap((product) => [
      product.image,
      product.hero,
      ...product.gallery,
      ...product.story.map((chapter) => chapter.media)
    ])
  ];

  return assets.filter((asset, index, list) => list.findIndex((candidate) => candidate.src === asset.src) === index);
}

describe("cinematic media contract", () => {
  it("keeps local cached media limited to cinematic shell assets", () => {
    const [firstHero] = heroSlides;
    const manifest = getCriticalMediaManifest();

    expect(firstHero?.title).toBe("Drone is Mithron");
    expect(firstHero?.poster.src).toMatch(/^\/assets\/hero\//);
    expect(firstHero?.video).toBeUndefined();
    expect(firstHero?.image.src).toMatch(/^\/assets\/hero\//);
    expect(manifest.map((asset) => asset.id)).toEqual(
      expect.arrayContaining(["hero-ag10-poster", "hero-ag10-loop"])
    );
    expect(manifest.some((asset) => asset.role === "product")).toBe(false);
    expect(manifest.some((asset) => asset.src.includes("/media/mithron/products/"))).toBe(false);
    expect(manifest.every((asset) => asset.src.startsWith("/media/mithron/") || asset.src.startsWith("/assets/hero/"))).toBe(true);
  });

  it("describes source PDP media with real Mithron product imagery", async () => {
    const product = await getProductBySlug("source-agri-kisan-drone-small-8-liter");

    expect(product?.name).toBe("Agri Kisan Drone Small - 8 Liter");
    expect(product?.image.src).toContain("/storage/v1/object/public/mithron-products/");
    expect(product?.image.width).toBeGreaterThanOrEqual(720);
    expect(product?.image.height).toBeGreaterThanOrEqual(720);
    expect(product?.gallery.map((asset) => asset.src)).toContain(product?.image.src);
    expect(product?.specs["Product ID"]).toBe("mithron-agri-kisan-drone-small-8-liter");
  });

  it("does not expose constrained legacy thumbnail renditions as primary catalog product images", async () => {
    const products = await getProducts();
    const constrainedPrimaryImages = products.filter((product) => /\/v1\/fit\/w_(?:50|500),h_(?:50|500),q_\d+\/file\./i.test(product.image.src));
    const lowResolutionPrimaryImages = products.filter((product) => {
      const width = product.image.width ?? 0;
      const height = product.image.height ?? 0;
      return width > 0 && height > 0 && Math.max(width, height) < 720;
    });

    expect(constrainedPrimaryImages.map((product) => `${product.slug}:${product.image.src}`)).toEqual([]);
    expect(lowResolutionPrimaryImages.map((product) => `${product.slug}:${product.image.width}x${product.image.height}`)).toEqual([]);
  });

  it("keeps hydrated product card images on canonical supabase or trusted remote urls", async () => {
    const products = await getProducts();
    const invalidPrimaryImages = products.filter((product) => {
      const src = product.image.src.trim();
      const fallbackSrc = product.image.responsive?.fallbackSrc?.trim() ?? "";
      const isSupabase = src.includes(".supabase.co/storage/v1/object/public/");
      const isTrustedRemote = /^https:\/\//i.test(src);
      if (!isSupabase && !isTrustedRemote) return true;
      if (fallbackSrc.includes("catalog-cutouts/v1/") && isSupabase) {
        return src !== fallbackSrc;
      }
      return false;
    });

    expect(invalidPrimaryImages.map((product) => `${product.slug}:${product.image.src}`)).toEqual([]);
  });

  it("keeps local generated responsive metadata for cinematic shell assets", () => {
    const assets = interests.map((interest) => interest.image);

    expect(assets.length).toBeGreaterThanOrEqual(9);
    expect(
      assets.every((asset) => {
        const responsive = (asset as typeof asset & { responsive?: unknown }).responsive;
        return Boolean(responsive);
      })
    ).toBe(true);
    expect(
      assets.every((asset) => {
        const responsive = (asset as typeof asset & { responsive?: { status?: string; bucket?: string; fallbackSrc?: string } }).responsive;
        return (
          responsive?.fallbackSrc === asset.src &&
          ["generated", "fallback", "missing"].includes(responsive.status ?? "") &&
          typeof responsive.bucket === "string" &&
          responsive.bucket.startsWith("mithron-")
        );
      })
    ).toBe(true);
  });

  it("renders database product images from Supabase storage", async () => {
    const assets = await collectStorefrontAssets();
    const productAssets = assets.filter((asset) => asset.src.includes(supabaseStoragePrefix));

    expect(productAssets.length).toBeGreaterThan(100);
    expect(productAssets.every((asset) => asset.src.includes(".supabase.co"))).toBe(true);
    expect(productAssets.every((asset) => !/wixstatic\.com/i.test(asset.src))).toBe(true);
  });

  it("renders database product images directly when no generated variant exists", async () => {
    const product = await getProductBySlug("source-hobbywing-x8-3011-propellers-with-mount-ccw");
    expect(product).toBeDefined();
    expect(product!.image.src).toContain(supabaseStoragePrefix);

    render(createElement(MithronResponsiveImage, { src: product!.image.src, alt: product!.image.alt, sizes: "80px" }));

    const image = screen.getByRole("img", { name: product!.image.alt });
    const picture = image.closest("picture");
    const wixSource = picture?.querySelector('source[srcset*="wixstatic"]');

    expect(picture?.getAttribute("data-mithron-asset-status")).toBe("missing");
    expect(picture?.getAttribute("data-mithron-asset-bucket")).toBe("unmapped");
    expect(wixSource).toBeNull();
    expect(image.getAttribute("src")).toBe(product!.image.src);
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("fetchpriority", "auto");
  });

  it("does not render an img element when src is empty", () => {
    const { container } = render(createElement(MithronThumbImage, { src: "", alt: "Missing product image", sizes: "80px" }));

    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector('[data-mithron-image-fallback="missing"]')).not.toBeNull();
  });

  it("renders Supabase catalog cutouts without legacy CDN srcsets", () => {
    const catalogSrc = "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/15-inch-drone-frame-001b273acafa.webp";

    render(createElement(MithronResponsiveImage, {
      src: catalogSrc,
      alt: "15-inch Drone Frame",
      width: 1200,
      height: 900,
      sizes: "(min-width: 768px) 320px, 80vw"
    }));

    const image = screen.getByRole("img", { name: "15-inch Drone Frame" });
    const picture = image.closest("picture");
    expect(image.getAttribute("src")).toBe(catalogSrc);
    expect(picture?.querySelector('source[srcset*="wixstatic"]')).toBeNull();
  });

  it("serves shelf hero assets from capped Supabase webp variants", async () => {
    const { MithronShelfHeroImage } = await import("@/components/media/mithron-shelf-hero-image");
    render(createElement(MithronShelfHeroImage, {
      src: "/media/mithron/showcase/drone_world_hero.png",
      alt: "Mithron Drone World hardware",
      sizes: "(max-width: 640px) 100vw, 1280px"
    }));

    const image = screen.getByRole("img", { name: "Mithron Drone World hardware" });
    const picture = image.closest("picture");
    const webpSource = picture?.querySelector('source[type="image/webp"]');

    expect(picture?.getAttribute("data-mithron-asset-status")).toBe("generated");
    expect(image.getAttribute("src")).toContain("supabase.co/storage");
    expect(image.getAttribute("src")).toMatch(/\.webp$/);
    expect(webpSource?.getAttribute("srcset")).toContain("w");
    expect(webpSource?.getAttribute("srcset")).not.toContain("2560w");
    expect(image).toHaveAttribute("loading", "lazy");
  });

  it("serves homepage heroes with avif and capped webp delivery", () => {
    const src = "/media/mithron/hero/ag10-command.webp";
    const responsive = getResponsiveAssetForSrc(src);

    render(createElement(MithronPageHeroImage, {
      src,
      alt: "Agri drone deployment",
      sizes: "100vw",
      priority: true
    }));

    const image = screen.getByRole("img", { name: "Agri drone deployment" });
    const picture = image.closest("picture");

    expect(responsive?.variants.avif?.length).toBeGreaterThan(0);
    expect(picture?.querySelector('source[type="image/avif"]')).not.toBeNull();
    expect(picture?.querySelector('source[type="image/webp"]')).not.toBeNull();
    expect(image.getAttribute("src")).not.toContain("2560w");
    expect(image).toHaveAttribute("loading", "eager");
  });

  it("caps thumb images to layout-sized webp variants", () => {
    const src = "/media/mithron/mission/agrone/agrone-drone-owner-registration.png";

    render(createElement(MithronThumbImage, {
      src,
      alt: "AGRONE drone owner registration",
      sizes: "80px"
    }));

    const image = screen.getByRole("img", { name: "AGRONE drone owner registration" });
    const picture = image.closest("picture");
    const webpSource = picture?.querySelector('source[type="image/webp"]');

    expect(image.getAttribute("src")).toMatch(/(384w|480w|768w)/);
    expect(webpSource?.getAttribute("srcset")).not.toContain("2560w");
    expect(webpSource?.getAttribute("srcset")).not.toContain("1920w");
    expect(webpSource?.getAttribute("srcset")).not.toContain("1280w");
  });

  it("caps mission-world tiles to lossless-quality webp variants sized for the layout", () => {
    const src = "/media/mithron/mission/agrone/agrone-drone-owner-registration.png";
    const responsive = getResponsiveAssetForSrc(src);
    const capped = getBestVariantUpToWidth(responsive, 1280, "webp");

    expect(capped?.width).toBe(768);
    expect(capped?.src).toMatch(/768w.*(restored-v1|local-v2).*\.webp$/);

    render(createElement(MithronMissionTileImage, {
      src,
      alt: "AGRONE drone owner registration",
      cardType: "hero",
      sizes: "(max-width: 980px) 100vw, 65vw",
      className: "agri-card-image"
    }));

    const image = screen.getByRole("img", { name: "AGRONE drone owner registration" });
    const picture = image.closest("picture");
    const webpSource = picture?.querySelector('source[type="image/webp"]');

    expect(image.getAttribute("src")).toContain("768w");
    expect(image.getAttribute("src")).toContain("restored-v1");
    expect(webpSource?.getAttribute("srcset")).not.toContain("2560w");
    expect(picture?.querySelector('source[type="image/png"]')).toBeNull();
    expect(image).toHaveAttribute("loading", "lazy");
  });

  it("keeps asset coverage status honest after Supabase upload verification", () => {
    const coverage = getGeneratedAssetCoverage();

    expect(coverage.buckets).toEqual(["mithron-hero", "mithron-products", "mithron-interests", "mithron-story"]);
    expect(coverage.total).toBeGreaterThan(15);
    expect(coverage.generated).toBe(coverage.total);
    expect(coverage.fallback).toBe(0);
  });
});
