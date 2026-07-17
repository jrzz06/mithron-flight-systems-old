import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const shelfCss = source("sections/home/home-shelf-shared.module.css");
const viewAllCss = source("sections/home/product-shelf-view-all-card.module.css");
const globalsCss = source("app/globals.css");

describe("product shelf mobile scroll", () => {
  it("enables horizontal touch scrolling on sub-desktop shelf grids without blocking vertical page scroll", () => {
    const tabletShelfBlock = shelfCss.match(/@media \(max-width: 1279px\)[\s\S]*?\.productShelfGrid \{[\s\S]*?\}/);

    expect(tabletShelfBlock?.[0]).toContain("touch-action: pan-x pan-y");
    expect(shelfCss).not.toMatch(/\.productCard[\s\S]*touch-action:\s*pan-x;/);
    expect(shelfCss).toMatch(
      /productShelfSection\[data-shelf-tone="global"\] \.productShelfGrid[\s\S]*overflow-x: auto/
    );
  });

  it("uses a horizontal snap carousel on phone shelves", () => {
    const carouselBlock = shelfCss.match(/@media \(max-width: 1279px\)[\s\S]*?\.productShelfGrid \{[\s\S]*?\}/);

    expect(carouselBlock?.[0]).toContain("grid-auto-flow: column");
    expect(carouselBlock?.[0]).toContain("overflow-x: auto");
    expect(carouselBlock?.[0]).toContain("scroll-snap-type: x mandatory");
    expect(carouselBlock?.[0]).toContain("var(--shelf-card-width)");
    expect(carouselBlock?.[0]).not.toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(globalsCss).toMatch(/@media \(max-width: 767px\)[\s\S]*--shelf-card-width:\s*clamp\(188px,\s*52vw,\s*232px\)/);
    expect(globalsCss).toMatch(/@media \(max-width: 767px\)[\s\S]*--shelf-card-aspect-ratio:\s*4\s*\/\s*3/);
    expect(globalsCss).toMatch(/--shelf-card-width:/);
  });

  it("uses responsive shelf card geometry with preserved desktop aspect ratio", () => {
    expect(shelfCss).toMatch(/\.productCard \{[\s\S]*aspect-ratio:\s*var\(--shelf-card-aspect-ratio/);
    expect(viewAllCss).toMatch(/\.viewAllCard \{[\s\S]*aspect-ratio:\s*var\(--shelf-card-aspect-ratio/);
    expect(globalsCss).toMatch(/--product-card-aspect-ratio:\s*5\s*\/\s*7/);
    expect(globalsCss).toMatch(/@media \(max-width: 1279px\)[\s\S]*--shelf-card-aspect-ratio:\s*3\s*\/\s*5/);
    expect(globalsCss).toMatch(/@media \(max-width: 767px\)[\s\S]*--shelf-card-aspect-ratio:\s*4\s*\/\s*3/);
    expect(shelfCss).not.toMatch(/@media \(max-width: 1279px\)[\s\S]*\.productCard[\s\S]*aspect-ratio:\s*auto/);
  });

  it("prevents shelf cards from compressing below the carousel column width", () => {
    const carouselCardBlock = shelfCss.match(
      /@media \(max-width: 1279px\)[\s\S]*?\.productCard \{[\s\S]*?min-width: var\(--shelf-card-width\)[\s\S]*?\}/
    );

    expect(carouselCardBlock?.[0]).toContain("min-width: var(--shelf-card-width)");
    expect(carouselCardBlock?.[0]).toMatch(/flex:\s*0\s+0\s+var\(--shelf-card-width\)/);
    expect(viewAllCss).toMatch(/@media \(max-width: 1279px\)[\s\S]*\.viewAllCard[\s\S]*min-width: var\(--shelf-view-all-carousel-width/);
  });

  it("keeps desktop shelf grid as a five-column board outside mobile media queries", () => {
    expect(shelfCss).toContain("repeat(4, minmax(0, var(--shelf-product-col");
    expect(shelfCss).toContain("var(--shelf-view-all-col");
    expect(shelfCss).toMatch(/@media \(max-width: 1279px\)[\s\S]*grid-template-columns: none/);
    expect(shelfCss).not.toMatch(/@media \(min-width: 1024px\) and \(max-width: 1279px\)/);
  });

  it("uses a client scroll rail for shelf cards", () => {
    const component = source("sections/home/product-shelf-section.tsx");
    const rail = source("sections/home/product-shelf-scroll-rail.tsx");
    const touchGuard = source("hooks/use-horizontal-scroll-touch-guard.ts");
    expect(component).toContain("ProductShelfScrollRail");
    expect(rail).toContain("useHorizontalScrollTouchGuard");
    expect(touchGuard).toContain("onTouchMove");
    expect(touchGuard).toContain("onClickCapture");
  });

  it("keeps shelf cards clipped so neighbors never bleed during resize", () => {
    expect(shelfCss).toMatch(/\.productCard\s*\{[\s\S]*?overflow:\s*hidden/);
    expect(viewAllCss).toMatch(/\.viewAllCard\s*\{[\s\S]*?overflow:\s*hidden/);
    expect(shelfCss).not.toMatch(/\.productCard:hover[\s\S]*overflow:\s*visible/);
    expect(shelfCss).not.toMatch(/\.productCard:focus-visible[\s\S]*overflow:\s*visible/);
  });
});
