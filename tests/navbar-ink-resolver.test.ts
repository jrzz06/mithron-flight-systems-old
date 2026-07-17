import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { resolveNavbarInkFromShowcase } from "@/lib/navbar-ink-sampling";
import {
  NAVBAR_INK_SURFACE_SELECTOR,
  resolveNavbarTone,
  resolvePathNavbarTone
} from "@/lib/navbar-ink-resolver";

function mountInkDom(markup: string) {
  document.body.innerHTML = markup;
}

function mockRect(element: Element, rect: Partial<DOMRect>) {
  const fullRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...rect
  } as DOMRect;

  element.getBoundingClientRect = () => fullRect;
}

describe("navbar ink resolver", () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    const root = document.createElement("html");
    const body = document.createElement("body");
    root.appendChild(body);
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        documentElement: root,
        body,
        querySelector: (selector: string) => body.querySelector(selector) ?? root.querySelector(selector),
        querySelectorAll: (selector: string) => body.querySelectorAll(selector)
      }
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument
    });
  });

  it("resolves path tones for home, categories, and utility routes", () => {
    expect(resolvePathNavbarTone("/")).toBe("light");
    expect(resolvePathNavbarTone("/category/agri-drones")).toBe("dark");
    expect(resolvePathNavbarTone("/category/video-drones")).toBe("dark");
    expect(resolvePathNavbarTone("/category/global-products")).toBe("dark");
    expect(resolvePathNavbarTone("/products")).toBe("dark");
    expect(resolvePathNavbarTone("/product/example")).toBe("dark");
  });

  it("prefers explicit showcase navbar ink over dominant color", () => {
    expect(resolveNavbarInkFromShowcase({ navbarInk: "light" }, "#f8f8f8")).toBe("light");
    expect(resolveNavbarInkFromShowcase({ navbarInk: "dark" }, "#081828")).toBe("dark");
    expect(resolveNavbarInkFromShowcase({}, "#081828")).toBe("light");
    expect(resolveNavbarInkFromShowcase({}, "#f8f8f8")).toBe("dark");
  });

  it("returns overlapping surface ink when declared", () => {
    mountInkDom(`
      <div class="storefront-root">
        <div class="TOP_NAVBAR adaptive-navbar">
          <header class="adaptive-navbar__bar"></header>
        </div>
        <main id="g-main" class="home-page-canvas"></main>
        <section id="hero" data-navbar-ink="light" data-navbar-ink-surface></section>
      </div>
    `);

    const bar = document.body.querySelector(".adaptive-navbar__bar")!;
    const hero = document.body.querySelector("#hero")!;
    mockRect(bar, { top: 34, bottom: 92, left: 0, right: 1440, width: 1440, height: 58 });
    mockRect(hero, { top: 0, bottom: 600, left: 0, right: 1440, width: 1440, height: 600 });

    expect(resolveNavbarTone("light", "/")).toBe("light");
  });

  it("keeps path tone during streaming gap before hero surfaces mount", () => {
    mountInkDom(`<main id="g-main" class="home-page-canvas"></main>`);
    expect(resolveNavbarTone("light", "/")).toBe("light");
  });

  it("returns dark on category routes when no hero surface is mounted", () => {
    mountInkDom(`
      <div class="TOP_NAVBAR adaptive-navbar">
        <header class="adaptive-navbar__bar"></header>
      </div>
    `);

    const bar = document.body.querySelector(".adaptive-navbar__bar")!;
    mockRect(bar, { top: 0, bottom: 58, left: 0, right: 1440, width: 1440, height: 58 });

    expect(resolveNavbarTone("light", "/category/global-products")).toBe("dark");
    expect(resolveNavbarTone("light", "/category/video-drones")).toBe("dark");
  });

  it("returns dark when scrolled past hero on flush pages", () => {
    mountInkDom(`
      <div class="storefront-root">
        <div class="TOP_NAVBAR adaptive-navbar">
          <header class="adaptive-navbar__bar"></header>
        </div>
        <main id="g-main" class="home-page-canvas"></main>
        <section id="hero" data-navbar-ink="light" data-navbar-ink-surface></section>
      </div>
    `);

    const bar = document.body.querySelector(".adaptive-navbar__bar")!;
    const hero = document.body.querySelector("#hero")!;
    mockRect(bar, { top: 34, bottom: 92, left: 0, right: 1440, width: 1440, height: 58 });
    mockRect(hero, { top: 900, bottom: 1500, left: 0, right: 1440, width: 1440, height: 600 });

    expect(resolveNavbarTone("light", "/")).toBe("dark");
  });

  it("returns dark for non-hero routes without overlapping surfaces", () => {
    mountInkDom(`
      <div class="TOP_NAVBAR adaptive-navbar">
        <header class="adaptive-navbar__bar"></header>
      </div>
    `);

    const bar = document.body.querySelector(".adaptive-navbar__bar")!;
    mockRect(bar, { top: 0, bottom: 58, left: 0, right: 1440, width: 1440, height: 58 });

    expect(resolveNavbarTone("dark", "/products")).toBe("dark");
  });

  it("matches ink surface selector used by observers", () => {
    expect(NAVBAR_INK_SURFACE_SELECTOR).toContain("#hero");
    expect(NAVBAR_INK_SURFACE_SELECTOR).toContain(".catalog-hero-section--showcase");
  });
});
