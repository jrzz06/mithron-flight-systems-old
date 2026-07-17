import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("safe media bandwidth optimization contract", () => {
  it("reserves high-priority image loading for homepage hero media only", () => {
    const heroCarousel = readWorkspaceFile("sections/home/hero-carousel.tsx");
    const productViewer = readWorkspaceFile("sections/product/product-media-viewer.tsx");
    const catalogPage = readWorkspaceFile("sections/catalog/catalog-page.tsx");

    expect(heroCarousel).toContain("priority={Boolean(slide.image.priority)}");
    expect(productViewer).not.toMatch(/<MithronPageHeroImage[\s\S]*?\spriority[\s\S]*?\/>/);
    expect(catalogPage).not.toContain('fetchPriority="high"');
    expect(catalogPage).not.toMatch(/<MithronPageHeroImage[\s\S]*?\spriority[\s\S]*?\/>/);
    expect(catalogPage).not.toContain('sizes="100vw"');
    expect(catalogPage.match(/sizes="\(min-width: 1440px\) 1440px, 100vw"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(catalogPage).toContain('type="image/avif"');
    expect(catalogPage).toContain('type="image/webp"');
  });

  it("removes the deprecated homepage media rail pipeline", () => {
    const packageJson = readWorkspaceFile("package.json");
    const auditTool = readWorkspaceFile("tools/audit-media-bandwidth.mjs");

    expect(existsSync(join(process.cwd(), "sections/home/cinematic-media-rail.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "data/home-cinematic-media-rail.generated.json"))).toBe(false);
    expect(existsSync(join(process.cwd(), "tools/upload-home-cinematic-media-rail-assets.mjs"))).toBe(false);
    expect(packageJson).not.toContain("assets:upload-media-rail");
    expect(auditTool).not.toContain("readMediaRailVideos");
    expect(auditTool).not.toContain("mediaRailVideos");
  });

  it("sets cache-stable Next image and static media delivery settings", () => {
    const nextConfig = readWorkspaceFile("next.config.ts");

    expect(nextConfig).toContain("minimumCacheTTL");
    expect(nextConfig).toContain("deviceSizes");
    expect(nextConfig).toContain("imageSizes");
    expect(nextConfig).toContain('source: "/optimized/:path*"');
    expect(nextConfig).toContain('source: "/media/:path*"');
    expect(nextConfig).toContain('source: "/assets/:path*"');
    expect(nextConfig).toContain("max-age=31536000, immutable");
  });

  it("keeps admin media upload revalidation scoped to product and CMS surfaces", () => {
    const actions = readWorkspaceFile("app/admin/products/actions.ts");

    expect(actions).toContain('revalidatePath("/admin/products")');
    expect(actions).toContain('revalidatePath("/admin/cms")');
    expect(actions).not.toContain('revalidatePath("/admin/media")');
  });

  it("provides a repeatable read-only media bandwidth audit tool", () => {
    const auditToolPath = join(process.cwd(), "tools/audit-media-bandwidth.mjs");

    expect(existsSync(auditToolPath)).toBe(true);

    const auditTool = readFileSync(auditToolPath, "utf8");
    expect(auditTool).toContain("largestLocalAssets");
    expect(auditTool).toContain("duplicateLocalAssets");
    expect(auditTool).toContain("categorySummary");
    expect(auditTool).toContain("bandwidthOffenders");
    expect(auditTool).toContain("remoteMithronAssets");
    expect(auditTool).toContain("codeSignals");
  });

  it("maps homepage hero slides to generated responsive variants", () => {
    const generatedAssets = readWorkspaceFile("config/generated-assets.ts");
    const manifest = readWorkspaceFile("data/mithron-supabase-assets.generated.json");

    expect(generatedAssets).toContain("mithron-supabase-assets.generated.json");
    expect(manifest).toContain("\"status\": \"generated\"");
    expect(manifest).toMatch(/supabase\.co\/storage/);
  });

  it("provides a repeatable storefront image migration pipeline with role-based quality and responsive widths", () => {
    const migrationPath = join(process.cwd(), "tools/migrate-storefront-images-to-supabase.mjs");
    const optimizerPath = join(process.cwd(), "tools/optimize-storefront-images.mjs");
    const heroOptimizerPath = join(process.cwd(), "tools/optimize-hero-slides.mjs");

    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(optimizerPath)).toBe(true);
    expect(existsSync(heroOptimizerPath)).toBe(true);

    const migration = readFileSync(migrationPath, "utf8");
    const optimizer = readFileSync(optimizerPath, "utf8");
    const heroOptimizer = readFileSync(heroOptimizerPath, "utf8");
    const remoteMap = readWorkspaceFile("data/mithron-storefront-remote-map.generated.json");

    expect(migration).toContain("migrate-storefront-manifest.json");
    expect(migration).toContain("mithron-storefront-remote-map.generated.json");
    expect(migration).toContain("realesrgan");
    expect(migration).toContain("3840");
    expect(migration).toContain("webpQuality = 96");
    expect(remoteMap).toMatch(/supabase\.co\/storage/);
    expect(optimizer).toContain("targetWidths");
    expect(optimizer).toContain("480");
    expect(optimizer).toContain("768");
    expect(optimizer).toContain("webp");
    expect(optimizer).not.toContain("/media/mithron/showcase/");
    expect(heroOptimizer).toContain("HERO_WEBP_QUALITY = 96");
  });

  it("provides a repeatable delivered image width audit tool", () => {
    const auditPath = join(process.cwd(), "tools/audit-delivered-image-widths.mjs");
    expect(existsSync(auditPath)).toBe(true);
    expect(readFileSync(auditPath, "utf8")).toContain("MithronThumbImage");
  });
});
