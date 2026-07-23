import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("mobile responsive contract (phone <=767px)", () => {
  it("uses a horizontal snap carousel on phone shelves", () => {
    const css = source("sections/home/home-shelf-shared.module.css");
    const globalsCss = source("app/globals.css");
    const carouselBlock = css.match(/@media \(max-width: 1279px\)[\s\S]*?\.productShelfGrid \{[\s\S]*?\}/);

    expect(carouselBlock?.[0]).toContain("grid-auto-flow: column");
    expect(carouselBlock?.[0]).toContain("overflow-x: auto");
    expect(carouselBlock?.[0]).toContain("scroll-snap-type: x mandatory");
    expect(carouselBlock?.[0]).toContain("var(--shelf-card-width)");
    expect(carouselBlock?.[0]).not.toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(globalsCss).toMatch(/@media \(max-width: 1279px\)[\s\S]*--shelf-card-width:\s*clamp\(168px,\s*27vw,\s*228px\)/);
    expect(globalsCss).toMatch(/@media \(max-width: 479px\)[\s\S]*--shelf-card-width:\s*clamp\(168px,\s*48vw,\s*208px\)/);
    expect(globalsCss).toMatch(/@media \(max-width: 767px\)[\s\S]*--shelf-card-width:\s*clamp\(188px,\s*52vw,\s*232px\)/);
    expect(globalsCss).toMatch(/@media \(max-width: 767px\)[\s\S]*--shelf-card-aspect-ratio:\s*4\s*\/\s*3/);
    expect(globalsCss).not.toMatch(/--shelf-card-width:[\s\S]*calc\(\(100% - var\(--card-gap\)\)/);
    expect(globalsCss).toMatch(/@media \(max-width: 1279px\)[\s\S]*--shelf-cards-per-viewport:\s*3\.15/);
    expect(globalsCss).toMatch(/@media \(max-width: 767px\)[\s\S]*--shelf-cards-per-viewport:\s*1\.35/);
    expect(css).not.toMatch(/@media \(min-width: 1024px\) and \(max-width: 1279px\)/);
  });

  it("keeps sub-desktop shelf horizontal scroll below 1280px", () => {
    const css = source("sections/home/home-shelf-shared.module.css");
    const tabletShelfBlock = css.match(/@media \(max-width: 1279px\)[\s\S]*?\.productShelfGrid \{[\s\S]*?\}/);

    expect(tabletShelfBlock?.[0]).toContain("overflow-x: auto");
    expect(tabletShelfBlock?.[0]).toContain("touch-action: pan-x pan-y");
  });

  it("applies 44px touch targets to shelf Buy Now and catalog CTA at 767px", () => {
    const homeCss = source("sections/home/home-shelf-shared.module.css");
    const globalsCss = source("app/globals.css");

    expect(homeCss).toMatch(/@media \(max-width: 767px\)[\s\S]*\.productBuyNow[\s\S]*min-height: var\(--mobile-touch-min/);
    expect(globalsCss).toMatch(
      /@media \(max-width: 767px\)[\s\S]*\.catalog-page-shell \.premium-product-card-shell\[data-cta-layout="buy-row"\] \.premium-product-card__cta-buy[\s\S]*min-height: var\(--mobile-touch-min/
    );
  });

  it("keeps catalog continued grid on 2, 3, or 4 columns", () => {
    const gridSource = source("sections/catalog/catalog-continued-grid.tsx");
    const globalsCss = source("app/globals.css");

    expect(gridSource).toContain("if (width < 768) return 2");
    expect(gridSource).toContain("if (width < 1024) return 3");
    expect(gridSource).toContain("return 4");
    expect(gridSource).toContain("Load more products");
    expect(gridSource).not.toContain("useWindowVirtualizer");
    expect(globalsCss).toContain(".catalog-continued-grid__rows");
  });

  it("defines shared mobile spacing tokens", () => {
    const globalsCss = source("app/globals.css");
    expect(globalsCss).toContain("--card-gap:");
    expect(globalsCss).toContain("--card-pad:");
    expect(globalsCss).toContain("--shelf-card-gap: var(--card-gap)");
    expect(globalsCss).toContain("--mobile-card-gap: var(--card-gap)");
    expect(globalsCss).toContain("--mobile-grid-gap: var(--card-gap)");
    expect(globalsCss).toContain("--shelf-card-width:");
    expect(globalsCss).toMatch(/--product-card-aspect-ratio:\s*5\s*\/\s*7/);
    expect(globalsCss).toContain("--product-card-image-ratio: 6 / 5");
    expect(globalsCss).toContain("--shelf-card-aspect-ratio:");
    expect(globalsCss).toContain("--shelf-mobile-card-aspect-ratio:");
    expect(globalsCss).toContain("--catalog-mobile-row-estimate: 280px");
  });

  it("clips catalog overflow and keeps buy-row footers in a single row on phone for catalog cards", () => {
    const globalsCss = source("app/globals.css");
    const phoneBlocks = [...globalsCss.matchAll(/@media \(max-width: 767px\)[\s\S]*?(?=@media|$)/g)].map((match) => match[0]);
    const phoneBlock = phoneBlocks.join("\n");

    expect(phoneBlock).toContain("overflow-x: clip");
    expect(phoneBlock).toContain('.catalog-page-shell .premium-product-card-shell[data-cta-layout="buy-row"] .premium-product-card__footer');
    expect(phoneBlock).toMatch(
      /\.catalog-page-shell \.premium-product-card-shell\[data-cta-layout="buy-row"\] \.premium-product-card__footer[\s\S]*flex-direction:\s*row/
    );
    expect(phoneBlock).toContain("padding-inline: var(--catalog-inline) !important");
  });

  it("keeps mission support cards as overlay tiles on phone", () => {
    const css = `${source("sections/home/home-landing-composite.module.css")}\n${source("sections/home/home-shelf-shared.module.css")}`;
    const phoneSupportBlock = css.match(
      /@media \(max-width: 767px\) \{\s*\.missionWorldSupportGrid \{[\s\S]*?\.missionWorldSlotTall > \.agriCard/
    );

    expect(phoneSupportBlock?.[0]).toContain("grid-template-columns: 1fr");
    expect(phoneSupportBlock?.[0]).not.toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(phoneSupportBlock?.[0]).toContain("aspect-ratio: 2 / 1");
    expect(phoneSupportBlock?.[0]).toContain("grid-auto-rows: auto");
    expect(phoneSupportBlock?.[0]).toMatch(
      /\.missionWorldSupportGrid > \.agriCard \.agriCardImage[\s\S]*object-fit: cover/
    );
    expect(phoneSupportBlock?.[0]).not.toContain("object-fit: contain");
  });

  it("uses mobile shelf image sizes aligned to peek carousel width", () => {
    const component = source("components/product/home-product-shelf-card.tsx");
    expect(component).toContain("(max-width: 479px) 54vw, (max-width: 767px) 56vw, (max-width: 1279px) 32vw, 280px");
  });

  it("hides shelf edge fades and uses responsive shelf card geometry on phone", () => {
    const css = source("sections/home/home-shelf-shared.module.css");
    const phoneBlocks = [...css.matchAll(/@media \(max-width: 767px\)[\s\S]*?(?=@media|$)/g)].map((match) => match[0]);
    const phoneBlock = phoneBlocks.join("\n");
    const carouselBlock = css.match(/@media \(max-width: 1279px\)[\s\S]*?\.productShelfSection \.shelfBoard::before[\s\S]*?display:\s*none/)?.[0] ?? "";

    expect(carouselBlock).toMatch(/\.productShelfSection \.shelfBoard::before[\s\S]*display:\s*none/);
    expect(carouselBlock).toMatch(/\.productShelfSection \.shelfBoard::after[\s\S]*display:\s*none/);
    expect(css).toMatch(/\.productCard \{[\s\S]*?aspect-ratio:\s*var\(--shelf-card-aspect-ratio/);
    expect(css).toMatch(/@media \(max-width: 1279px\)[\s\S]*\.productCard[\s\S]*grid-template-rows:/);
    expect(phoneBlock).toMatch(/gap:\s*var\(--shelf-row-gap/);
  });

  it("removes mini-carousel edge fade masks", () => {
    const css = source("sections/home/home-landing-composite.module.css");
    const fadeBlock = css.match(/\.miniCarouselViewport::before,\s*\.miniCarouselViewport::after \{[\s\S]*?\}/);

    expect(fadeBlock?.[0]).toContain("display: none");
    expect(fadeBlock?.[0]).not.toContain("linear-gradient");
  });

  it("keeps catalog buy-row footers in a single row at all breakpoints", () => {
    const globalsCss = source("app/globals.css");
    const buyRowFooterBlock = globalsCss.match(
      /\.catalog-page-shell \.premium-product-card-shell\[data-cta-layout="buy-row"\] \.premium-product-card__footer\s*\{[\s\S]*?\}/
    )?.[0];

    expect(buyRowFooterBlock).toBeTruthy();
    expect(buyRowFooterBlock).toContain("flex-direction: row");
    expect(buyRowFooterBlock).not.toContain("flex-direction: column");
  });

  it("keeps showroom catalog footers horizontal at all breakpoints", () => {
    const cardCss = source("components/cards/product-hover-card.module.css");
    const catalogFooterBlock = cardCss.match(
      /\.shell\[data-card-variant="catalog"\] \.footer\s*\{[\s\S]*?\}/
    )?.[0];

    expect(catalogFooterBlock).toBeTruthy();
    expect(catalogFooterBlock).toContain("flex-direction: row");
    expect(catalogFooterBlock).not.toContain("flex-direction: column");
  });

  it("uses catalog product grid for PDP discovery cards", () => {
    const discovery = source("sections/product/discovery-product-grid.tsx");
    const recent = source("sections/product/product-recently-viewed-section.tsx");
    expect(discovery).toContain("catalog-product-grid");
    expect(discovery).toContain('variant="catalog"');
    expect(discovery).toContain('cta="catalog"');
    expect(recent).toContain("catalog-product-grid");
    expect(recent).toContain('variant="catalog"');
  });

  it("locks catalog grids to 2 columns on phone, 3 on tablet, and 4 on desktop", () => {
    const globalsCss = source("app/globals.css");
    const catalogCss = source("app/storefront-catalog.css");
    const showroomCss = source("sections/catalog/catalog-page.module.css");
    const catalogGridBlock = globalsCss.match(
      /\.catalog-product-grid \{[\s\S]*?\.catalog-product-grid--continued/
    )?.[0];

    expect(globalsCss).toMatch(
      /\.catalog-product-grid[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(globalsCss).toMatch(
      /@media \(min-width: 768px\) and \(max-width: 1023px\)[\s\S]*\.catalog-product-grid[\s\S]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(catalogCss).toMatch(
      /@media \(min-width: 768px\) and \(max-width: 1023px\)[\s\S]*\.catalog-product-grid[\s\S]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(catalogCss).toMatch(
      /@media \(min-width: 1024px\)[\s\S]*\.catalog-product-grid[\s\S]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(globalsCss).toMatch(
      /\.catalog-continued-grid__rows[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(catalogCss).toMatch(
      /@media \(min-width: 1024px\)[\s\S]*\.catalog-continued-grid__rows[\s\S]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(showroomCss).toMatch(
      /\.productGrid[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(showroomCss).toMatch(
      /@media \(min-width: 768px\) and \(max-width: 1023px\)[\s\S]*\.productGrid[\s\S]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(showroomCss).toMatch(
      /@media \(min-width: 1024px\)[\s\S]*\.productGrid[\s\S]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(catalogGridBlock).not.toMatch(/auto-fill/);
  });

  it("keeps catalog price text on one line while keeping buy-row footer horizontal on phone", () => {
    const globalsCss = source("app/globals.css");
    const cardCss = source("components/cards/product-hover-card.module.css");
    const phoneBlocks = [...globalsCss.matchAll(/@media \(max-width: 767px\)[\s\S]*?(?=@media|$)/g)].map((match) => match[0]);
    const phoneBlock = phoneBlocks.join("\n");

    expect(phoneBlock).toMatch(
      /\.catalog-page-shell \.premium-product-card-shell\[data-cta-layout="buy-row"\] \.premium-product-card__price[\s\S]*white-space:\s*nowrap/
    );
    expect(phoneBlock).toMatch(
      /\.catalog-page-shell \.premium-product-card-shell\[data-cta-layout="buy-row"\] \.premium-product-card__cta-buy[\s\S]*min-height:\s*var\(--mobile-touch-min/
    );
    expect(cardCss).toMatch(/\.price \{[\s\S]*white-space:\s*nowrap/);
    expect(cardCss).toMatch(/\.cta \{[\s\S]*width:\s*100%/);
  });

  it("uses horizontal space-between shelf footers on phone", () => {
    const css = source("sections/home/home-shelf-shared.module.css");
    const phoneBlocks = [...css.matchAll(/@media \(max-width: 767px\)[\s\S]*?(?=@media|$)/g)].map((match) => match[0]);
    const phoneBlock = phoneBlocks.join("\n");
    const buyNowBlock = phoneBlock.match(/\.productBuyNow \{[\s\S]*?\}/)?.[0] ?? "";

    expect(phoneBlock).toMatch(/\.productFooter[\s\S]*justify-content:\s*space-between/);
    expect(buyNowBlock).toMatch(/min-height:\s*var\(--mobile-touch-min/);
    expect(phoneBlock).not.toMatch(/\.productFooter[\s\S]*grid-template-columns:\s*1fr/);
    expect(buyNowBlock).not.toContain("width: 100%");
  });

  it("uses auto row sizing on desktop catalog grids", () => {
    const globalsCss = source("app/globals.css");
    const showroomCss = source("sections/catalog/catalog-page.module.css");
    const cardCss = source("components/cards/product-hover-card.module.css");

    expect(globalsCss).toMatch(/\.catalog-product-grid[\s\S]*?grid-auto-rows:\s*auto/);
    expect(globalsCss).toMatch(/\.catalog-continued-grid__rows[\s\S]*?grid-auto-rows:\s*auto/);
    expect(showroomCss).toMatch(/\.productGrid[\s\S]*?grid-auto-rows:\s*auto/);
    expect(globalsCss).toMatch(
      /\.catalog-page-shell \.premium-product-card__description \{[\s\S]*?flex:\s*0\s+1\s+auto/
    );
    expect(cardCss).toMatch(/\.description \{[\s\S]*?flex:\s*0\s+1\s+auto/);
  });

  it("removes catalog product image stage overlays for a seamless white card", () => {
    const globalsCss = source("app/globals.css");

    expect(globalsCss).toMatch(
      /\.catalog-page-shell \.premium-product-card__media::after[\s\S]*display:\s*none/
    );
    expect(globalsCss).toMatch(
      /\.catalog-page-shell \.premium-product-card__media\s*\{[\s\S]*background:\s*#ffffff/
    );
  });

  it("applies 44px touch targets to cart drawer quantity controls at 767px", () => {
    const css = source("components/overlays/cart-drawer.module.css");
    const phoneBlock = css.match(/@media \(max-width: 767px\)[\s\S]*?(?=@media|$)/);

    expect(phoneBlock?.[0]).toMatch(/\.quantityControl[\s\S]*grid-template-columns:\s*repeat\(3,\s*var\(--mobile-touch-min/);
    expect(phoneBlock?.[0]).toMatch(/\.quantityButton[\s\S]*width:\s*var\(--mobile-touch-min/);
  });

  it("defines PDP mobile purchase bar safe-area padding", () => {
    const css = source("sections/product/showcase/product-showcase.module.css");

    expect(css).toMatch(/\.mobilePurchaseBar[\s\S]*env\(safe-area-inset-bottom/);
    expect(css).toMatch(/\.heroSection[\s\S]*padding-bottom:\s*calc\(5\.5rem \+ env\(safe-area-inset-bottom/);
  });

  it("allows login root scrolling on short viewports", () => {
    const css = source("app/login/login.module.css");

    expect(css).toMatch(/\.loginRoot[\s\S]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.loginRoot[\s\S]*min-height:\s*100dvh/);
  });

  it("defines fluid page inline spacing tokens", () => {
    const globalsCss = source("app/globals.css");

    expect(globalsCss).toContain("--fluid-page-inline:");
    expect(globalsCss).toContain("--home-mobile-inline:");
    expect(globalsCss).toMatch(/--home-mobile-inline:\s*clamp\(18px,\s*5vw,\s*28px\)/);
    expect(globalsCss).toContain("--fluid-section-gap:");
    expect(globalsCss).toContain("--fluid-card-pad:");
    expect(globalsCss).toContain("--fluid-type-h1:");
  });

  it("uses shared homepage mobile gutters on phone shelves and mission sections", () => {
    const shelfCss = source("sections/home/home-shelf-shared.module.css");
    const compositeCss = source("sections/home/home-landing-composite.module.css");
    const bannerCss = source("sections/home/home-inter-shelf-banner.module.css");
    const globalsCss = source("app/globals.css");
    const testimonialsCss = source("sections/home/home-client-testimonials-section.module.css");
    const articlesCss = source("sections/home/home-related-articles-section.module.css");
    const carouselBlock = shelfCss.match(/@media \(max-width: 1279px\)[\s\S]*?\.productShelfGrid \{[\s\S]*?\}/)?.[0] ?? "";
    const compositePhoneBlock = compositeCss.match(/@media \(max-width: 767px\)[\s\S]*?(?=@media|$)/)?.[0] ?? "";

    expect(globalsCss).toMatch(/\[data-home-composite-root="true"\][\s\S]*--home-section-inline:/);
    expect(globalsCss).toMatch(/\[data-home-composite-root="true"\] \[data-home-content-shell="true"\][\s\S]*padding-inline:\s*var\(--home-section-inline/);
    expect(globalsCss).toMatch(/\[data-home-composite-root="true"\] \[data-home-content-shell="true"\][\s\S]*margin-inline:\s*auto/);
    expect(globalsCss).toMatch(/\[data-home-premium-shell="true"\][\s\S]*--home-premium-max-width:\s*1680px/);
    expect(globalsCss).toMatch(/\[data-home-premium-shell="true"\][\s\S]*--home-premium-inline:\s*20px/);
    expect(globalsCss).toMatch(/@media \(min-width: 1536px\)[\s\S]*\[data-home-premium-shell="true"\][\s\S]*--home-premium-inline:\s*72px/);
    expect(carouselBlock).toContain("margin-inline: calc(-1 * var(--home-section-inline");
    expect(carouselBlock).toContain("scroll-padding-inline: var(--home-section-inline");
    expect(carouselBlock).not.toContain("scroll-padding-inline: var(--home-mobile-inline");
    expect(shelfCss).not.toMatch(/\.productShelfSection \.container \{[\s\S]*?padding-inline:\s*var\(--home-mobile-inline/);
    expect(shelfCss).toMatch(/@media \(max-width: 1279px\)[\s\S]*\.productShelfSection \.shelfBoard[\s\S]*overflow-x:\s*visible/);
    expect(shelfCss).toMatch(/@media \(max-width: 1279px\)[\s\S]*\.productShelfHero[\s\S]*margin-top:\s*clamp\(12px,\s*2vw,\s*18px\)/);
    expect(shelfCss).toMatch(/@media \(max-width: 1279px\)[\s\S]*\.shelfHeroCopy[\s\S]*padding:\s*0 clamp\(20px,\s*4\.5vw,\s*36px\)/);
    expect(compositePhoneBlock).toContain("padding-inline: var(--home-mobile-inline");
    expect(compositeCss).toMatch(/@media \(max-width: 768px\)[\s\S]*\.miniCarouselRail[\s\S]*var\(--home-mobile-inline/);
    expect(compositeCss).toMatch(
      /@media \(max-width: 640px\)[\s\S]*\.missionWorldSection \.container[\s\S]*var\(--home-mobile-inline/
    );
    expect(bannerCss).toContain("padding-block: var(--ds-s5)");
    expect(bannerCss).not.toMatch(/\.section[\s\S]*padding-inline:/);
    expect(testimonialsCss).toMatch(/@media \(max-width: 1023px\)[\s\S]*padding-inline:\s*var\(--home-mobile-inline/);
    expect(testimonialsCss).toMatch(/@media \(max-width: 1023px\)[\s\S]*--testimonial-card-width:\s*calc/);
    expect(testimonialsCss).toMatch(/@media \(max-width: 767px\)[\s\S]*--testimonial-card-width:\s*100%/);
    expect(testimonialsCss).toMatch(/\.track[\s\S]*scroll-snap-type:\s*x mandatory/);
    expect(articlesCss).toMatch(/@media \(max-width: 1023px\)[\s\S]*\.gallery[\s\S]*padding-inline:\s*var\(--home-premium-inline/);
    expect(articlesCss).toMatch(/@media \(max-width: 1023px\)[\s\S]*\.gallery[\s\S]*display:\s*flex/);
    expect(articlesCss).toMatch(
      /@media \(max-width: 1023px\)[\s\S]*\.gallery[\s\S]*scroll-snap-type:\s*x mandatory/
    );
  });

  it("uses catalog card aspect-ratio modifier for fluid media", () => {
    const component = source("components/cards/product-hover-card.tsx");
    const globalsCss = source("app/globals.css");
    const hoverCardCss = source("components/cards/product-hover-card.module.css");

    expect(component).toContain("premium-product-card__media--catalog");
    expect(globalsCss).toMatch(
      /\.premium-product-card__media--catalog[\s\S]*aspect-ratio:\s*var\(--product-card-image-ratio\)/
    );
    expect(globalsCss).toContain("--catalog-mobile-media-aspect-ratio: 4 / 3");
    expect(globalsCss).toMatch(
      /@media \(max-width: 640px\)[\s\S]*\.catalog-page-shell \.premium-product-card__media[\s\S]*aspect-ratio:\s*var\(--catalog-mobile-media-aspect-ratio\)/
    );
    expect(hoverCardCss).toMatch(
      /@media \(max-width: 640px\)[\s\S]*\.media[\s\S]*aspect-ratio:\s*var\(--catalog-mobile-media-aspect-ratio\)/
    );
  });

  it("uses responsive shelf card geometry with auto height for reference card layout", () => {
    const shelfCss = source("sections/home/home-shelf-shared.module.css");
    const viewAllCss = source("sections/home/product-shelf-view-all-card.module.css");
    const globalsCss = source("app/globals.css");

    expect(shelfCss).toMatch(/\.productCard \{[\s\S]*aspect-ratio:\s*var\(--shelf-card-aspect-ratio/);
    expect(shelfCss).toMatch(/@media \(min-width: 1280px\)[\s\S]*\.shelfBoard[\s\S]*overflow-x:\s*clip/);
    expect(globalsCss).toMatch(/@media \(max-width: 1279px\)[\s\S]*--shelf-card-aspect-ratio:\s*3\s*\/\s*5/);
    expect(globalsCss).toMatch(/@media \(max-width: 767px\)[\s\S]*--shelf-card-aspect-ratio:\s*4\s*\/\s*3/);
    expect(globalsCss).toContain("--shelf-card-min-width:");
    expect(globalsCss).toContain("--shelf-card-max-width:");
    expect(shelfCss).toMatch(/@media \(max-width: 1279px\)[\s\S]*\.productCard[\s\S]*aspect-ratio:\s*var\(--shelf-card-aspect-ratio\)/);
    expect(viewAllCss).toMatch(/\.viewAllCard \{[\s\S]*aspect-ratio:\s*var\(--shelf-card-aspect-ratio/);
    expect(globalsCss).toMatch(/--product-card-aspect-ratio:\s*5\s*\/\s*7/);
    expect(globalsCss).not.toMatch(/\.catalog-page-shell \.premium-product-card__media \{[\s\S]*height:\s*260px/);
  });

  it("defines complete storefront z-index overlay scale", () => {
    const globalsCss = source("app/globals.css");

    expect(globalsCss).toContain("--z-overlay-backdrop:");
    expect(globalsCss).toContain("--z-overlay-panel:");
    expect(globalsCss).toContain("--z-overlay-launcher:");
    expect(globalsCss).toMatch(/--z-overlay:\s*var\(--z-overlay-backdrop\)/);
  });

  it("does not mask horizontal overflow on html or body", () => {
    const globalsCss = source("app/globals.css");
    const htmlBlock = globalsCss.match(/html \{[\s\S]*?\}/)?.[0] ?? "";
    const bodyBlock = globalsCss.match(/body \{[\s\S]*?\}/)?.[0] ?? "";

    expect(htmlBlock).not.toMatch(/overflow-x:\s*(hidden|clip)/);
    expect(bodyBlock).not.toMatch(/overflow-x:\s*(hidden|clip)/);
  });

  it("defines assistant FAB offset and bottom-chrome tokens", () => {
    const globalsCss = source("app/globals.css");
    const launcherCss = source("components/assistant/mithron-assistant-launcher.module.css");

    expect(globalsCss).toContain("--assistant-fab-offset:");
    expect(globalsCss).toMatch(/:root:has\(\[data-product-mobile-purchase-bar\]\)/);
    expect(globalsCss).toContain("--store-bottom-chrome:");
    expect(globalsCss).toMatch(/@media \(max-width: 1279px\)[\s\S]*--store-bottom-chrome:/);
    expect(launcherCss).toContain("var(--assistant-fab-offset");
    expect(launcherCss).toContain("var(--z-overlay-launcher)");
  });

  it("uses 44px default store button height on touch surfaces", () => {
    const globalsCss = source("app/globals.css");
    const buttonTsx = source("components/ui/button.tsx");

    expect(globalsCss).toMatch(/:root[\s\S]*--store-button-height:\s*44px/);
    expect(buttonTsx).toContain("--store-button-height,44px");
    expect(buttonTsx).not.toContain("overflow-hidden text-ellipsis");
  });

  it("defines foldable and tablet breakpoint tokens", () => {
    const globalsCss = source("app/globals.css");

    expect(globalsCss).toContain("--bp-foldable-min:");
    expect(globalsCss).toContain("--bp-tablet-mid:");
    expect(globalsCss).toContain("--bp-tablet-wide:");
    expect(globalsCss).toMatch(/@media \(max-width: 390px\)/);
    expect(globalsCss).toMatch(/@media \(max-width: 1279px\)[\s\S]*--shelf-card-width:\s*clamp\(168px,\s*27vw,\s*228px\)/);
    expect(globalsCss).toMatch(/@media \(max-width: 479px\)[\s\S]*--shelf-card-width:\s*clamp\(168px,\s*48vw,\s*208px\)/);
    expect(globalsCss).toMatch(/@media \(max-width: 767px\)[\s\S]*--shelf-card-width:\s*clamp\(188px,\s*52vw,\s*232px\)/);
    expect(globalsCss).toMatch(/@media \(max-width: 767px\)[\s\S]*--shelf-card-aspect-ratio:\s*4\s*\/\s*3/);
    expect(globalsCss).toMatch(/@media \(max-width: 1279px\)[\s\S]*--shelf-cards-per-viewport:\s*3\.15/);
    expect(globalsCss).not.toMatch(/@media \(min-width: 820px\) and \(max-width: 1023px\)/);
    expect(globalsCss).not.toMatch(/@media \(min-width: 853px\) and \(max-width: 1023px\)/);
  });

  it("guards horizontal scroll rails and hero swipes against accidental link taps on touch", () => {
    const hero = source("sections/home/hero-carousel.tsx");
    const miniCarousel = source("sections/home/home-mini-carousel.tsx");
    const articlesGallery = source("sections/home/home-related-articles-gallery.tsx");
    const testimonialsCarousel = source("sections/home/home-client-testimonials-carousel.tsx");
    const shelfRail = source("sections/home/product-shelf-scroll-rail.tsx");
    const touchGuard = source("hooks/use-horizontal-scroll-touch-guard.ts");
    const carouselSwipe = source("hooks/use-carousel-swipe.ts");
    const compositeCss = source("sections/home/home-landing-composite.module.css");

    expect(hero).toContain("useCarouselSwipe");
    expect(hero).toContain("onTouchStart={heroSwipe.onTouchStart}");
    expect(hero).toContain("onClickCapture={heroSwipe.onClickCapture}");
    expect(hero).toContain("touch-pan-y");
    expect(miniCarousel).toContain("HorizontalScrollTouchRail");
    expect(articlesGallery).toContain("HorizontalScrollTouchRail");
    expect(testimonialsCarousel).toContain("HorizontalScrollTouchRail");
    expect(testimonialsCarousel).toContain("useCssMarquee");
    expect(testimonialsCarousel).toContain("marqueeEnabled");
    expect(testimonialsCarousel).toContain("marqueeReady");
    expect(shelfRail).toContain("HorizontalScrollTouchRail");
    expect(touchGuard).toContain("onTouchMove");
    expect(touchGuard).toContain("onClickCapture");
    expect(carouselSwipe).toContain("SWIPE_THRESHOLD");
    expect(compositeCss).toMatch(/\.miniCarouselRail[\s\S]*touch-action:\s*pan-x pan-y/);
  });
});
