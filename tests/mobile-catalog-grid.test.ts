import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("mobile catalog grid layout", () => {
  it("uses load-more batching for continued catalog grids", () => {
    const gridSource = source("sections/catalog/catalog-continued-grid.tsx");
    const globalsCss = source("app/globals.css");

    expect(gridSource).toContain("INITIAL_BATCH = 8");
    expect(gridSource).toContain("BATCH_SIZE = 8");
    expect(gridSource).toContain("Load more products");
    expect(gridSource).not.toContain("useWindowVirtualizer");
    expect(globalsCss).toContain("[data-catalog-continued-grid]");
    expect(globalsCss).toContain(".catalog-continued-grid__rows");
    expect(source("app/storefront-catalog.css")).toContain("margin-top: clamp(1.5rem, 3vw, 2.5rem)");
  });

  it("keeps 2-column catalog grids and stacked catalog footers", () => {
    const globalsCss = source("app/globals.css");
    const showroomCss = source("sections/catalog/catalog-page.module.css");
    const cardCss = source("components/cards/product-hover-card.module.css");

    expect(globalsCss).toMatch(
      /@media \(max-width: 767px\)[\s\S]*\.catalog-product-grid[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(globalsCss).toMatch(
      /\.catalog-page-shell \.premium-product-card-shell\[data-cta-layout="buy-row"\] \.premium-product-card__footer[\s\S]*flex-direction:\s*column/
    );
    const catalogFooterBlock = cardCss.match(
      /\.shell\[data-card-variant="catalog"\] \.footer\s*\{[\s\S]*?\}/
    )?.[0];
    expect(catalogFooterBlock).toBeTruthy();
    expect(catalogFooterBlock).toContain("flex-direction: column");
    expect(catalogFooterBlock).not.toContain("flex-direction: row");
    expect(showroomCss).toMatch(
      /@media \(max-width: 767px\)[\s\S]*\.productGrid[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(showroomCss).toMatch(
      /@media \(max-width: 767px\)[\s\S]*\.footer[\s\S]*flex-direction:\s*column/
    );
    expect(showroomCss).toMatch(
      /@media \(max-width: 767px\)[\s\S]*\.price[\s\S]*white-space:\s*nowrap/
    );
  });

  it("uses consistent mobile catalog padding", () => {
    const globalsCss = source("app/globals.css");
    expect(globalsCss).toContain("--catalog-inline:");
    expect(globalsCss).toMatch(
      /@media \(max-width: 1279px\)[\s\S]*\.catalog-page-shell[\s\S]*--catalog-inline:\s*clamp\(10px,\s*2vw,\s*16px\)/
    );
    expect(globalsCss).toMatch(
      /@media \(max-width: 767px\)[\s\S]*\.catalog-grid-section[\s\S]*padding-inline:\s*var\(--catalog-inline\) !important/
    );
  });

  it("keeps featured editorial CTA visible on phone", () => {
    const globalsCss = source("app/globals.css");
    expect(globalsCss).toMatch(
      /@media \(max-width: 767px\)[\s\S]*\.catalog-editorial-band[\s\S]*overflow:\s*visible/
    );
    expect(globalsCss).toMatch(
      /@media \(max-width: 640px\)[\s\S]*\.catalog-editorial-band__cta-buy[\s\S]*flex-shrink:\s*0/
    );
  });

  it("uses premium editorial band presentation", () => {
    const listing = source("sections/catalog/catalog-browse-lead-grid.tsx");
    const globalsCss = source("app/globals.css");
    const glassCss = source("app/glass-interactive.css");
    expect(listing).toMatch(/catalog-editorial-band/);
    expect(listing).not.toMatch(/aurora-blob/);
    expect(listing).not.toMatch(/featuredProduct\.image/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band[\s\S]*0\.62fr/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band[\s\S]*#0f172a/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band[\s\S]*#1e293b/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band[\s\S]*72% 48%/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band::after[\s\S]*radial-gradient/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band__aurora::before[\s\S]*repeating-linear-gradient/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band__aurora[\s\S]*72% 46%/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band__aurora::after[\s\S]*72% 44%/);
    expect(listing).toMatch(/--editorial-image-scale/);
    expect(listing).not.toMatch(/catalog-editorial-band__glass/);
    expect(globalsCss).toMatch(/\.catalog-page-shell \.catalog-editorial-band__media \.mithron-responsive-image-frame[\s\S]*mask-image:\s*radial-gradient/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band__media::after[\s\S]*50% 48%/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band__media\s*\{[\s\S]*?aspect-ratio:\s*16\s*\/\s*10/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band__media\s*\{[\s\S]*?background:\s*transparent/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band__media::before[\s\S]*blur\(16px\)/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band__image[\s\S]*scale\(var\(--editorial-image-scale/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band__cta-buy[\s\S]*align-self:\s*flex-start/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band__cta-buy[\s\S]*width:\s*fit-content/);
    const editorialImageBlock = globalsCss.match(/\.catalog-page-shell \.catalog-editorial-band__image\s*\{[\s\S]*?\}/);
    expect(editorialImageBlock).toBeTruthy();
    const editorialImageCss = editorialImageBlock![0];
    expect(editorialImageCss).not.toMatch(/drop-shadow\(0\s+0\s+/);
    expect(editorialImageCss).not.toMatch(/brightness\(/);
    expect(editorialImageCss).toMatch(/drop-shadow\([\s\S]*rgba\(0,\s*0,\s*0/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band__title[\s\S]*max-width:\s*32ch/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band__title[\s\S]*color:\s*#ffffff/);
    expect(globalsCss).toMatch(/\.catalog-editorial-band__cta-buy[\s\S]*background:\s*#d8f3e6/);
    expect(glassCss).not.toMatch(/\.catalog-editorial-band__cta/);
  });
});
