import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("glass interactive ui system", () => {
  it("defines centralized glass tokens and reusable classes", () => {
    const glass = source("app/glass-interactive.css");

    expect(glass).toContain("--glass-green-ink: #111111");
    expect(glass).toContain("--glass-green-ink-hover: #111111");
    expect(glass).toContain("--brand-cta-ink: var(--glass-green-ink)");
    expect(glass).toContain(".glass-button");
    expect(glass).toContain(".glass-button--cart");
    expect(glass).toContain(".glass-pill");
    expect(glass).toContain(".glass-badge");
    expect(glass).toContain(".glass-chip");
  });

  it("wires accent buttons through the shared glass button system", () => {
    const button = source("components/ui/button.tsx");
    const configurator = source("sections/product/product-configurator.tsx");

    expect(button).toContain('accentCart: cn(glassButtonClassName({ cart: true })');
    expect(configurator).toContain('variant="accent"');
    expect(configurator).toContain("Buy Now");
    expect(configurator).toContain('variant="outline"');
  });

  it("does not modify the Mithron logo markup or styling", () => {
    const nav = source("components/navigation/store-nav.tsx");
    const brandMark = source("components/brand/mithron-brand-mark.tsx");

    expect(nav).toContain("MithronBrandMark");
    expect(nav).not.toContain('src = "/media/mithron/shell/mithron-wordmark.png"');
    expect(nav).not.toContain("glass-button");
    expect(brandMark).toContain("resolveBrandMarkSrc");
    expect(brandMark).toContain("mithron-brand-mark");
    expect(brandMark).not.toContain("unoptimized");
  });

  it("keeps the nav wordmark off Real-ESRGAN enhancement pipelines", () => {
    const inventory = source("tools/storefront-image-inventory.mjs");
    const enhance = source("tools/enhance-visible-storefront.mjs");
    const migrate = source("tools/migrate-storefront-images-to-supabase.mjs");

    expect(inventory).toContain("AI_ENHANCEMENT_EXCLUDED_SRCS");
    expect(inventory).toContain('"/media/mithron/shell/mithron-wordmark.png"');
    expect(enhance).not.toContain("mithron-wordmark.png");
    expect(migrate).toContain("isAiEnhancementExcluded");
    expect(migrate).toContain("upload-wordmark-to-supabase.mjs");
  });
});
