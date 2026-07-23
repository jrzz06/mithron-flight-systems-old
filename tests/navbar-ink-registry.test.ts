import { describe, expect, it } from "vitest";
import {
  categoryPathNavbarInk,
  getBootstrapNavbarInk,
  HOMEPAGE_BOOTSTRAP_SLIDE_ID,
  homepageSlideNavbarInk,
  resolveCategoryNavbarInk,
  resolveCategoryNavbarInkByCmsRouteKey,
  resolveHomepageSlideNavbarInk,
  resolveNavbarChromeMode
} from "@/config/navbar-ink-registry";

describe("navbar ink registry", () => {
  it("defines ink for all three homepage carousel slides", () => {
    expect(homepageSlideNavbarInk["ag10-arrival"]).toBe("light");
    expect(homepageSlideNavbarInk["mapping-flight"]).toBe("light");
    expect(homepageSlideNavbarInk["drone-ecosystem"]).toBe("light");
  });

  it("defines ink for all seven category showcase paths", () => {
    expect(Object.keys(categoryPathNavbarInk)).toHaveLength(7);
    expect(categoryPathNavbarInk["/category/agri-drones"]).toBe("light");
    expect(categoryPathNavbarInk["/category/video-drones"]).toBe("light");
    expect(categoryPathNavbarInk["/category/global-products"]).toBe("light");
    expect(Object.values(categoryPathNavbarInk).every((ink) => ink === "light")).toBe(true);
  });

  it("resolves homepage slide ink with light fallback", () => {
    expect(resolveHomepageSlideNavbarInk("ag10-arrival")).toBe("light");
    expect(resolveHomepageSlideNavbarInk("unknown-slide")).toBe("light");
  });

  it("resolves category ink by path and cms route key", () => {
    expect(resolveCategoryNavbarInk("/category/video-drones")).toBe("light");
    expect(resolveCategoryNavbarInk("/category/agri-drones")).toBe("light");
    expect(resolveCategoryNavbarInkByCmsRouteKey("videoDrones")).toBe("light");
    expect(resolveCategoryNavbarInkByCmsRouteKey("agriculture")).toBe("light");
    expect(resolveCategoryNavbarInkByCmsRouteKey("unknown")).toBeNull();
  });

  it("uses solid chrome and dark ink for homepage bootstrap", () => {
    expect(HOMEPAGE_BOOTSTRAP_SLIDE_ID).toBe("ag10-arrival");
    expect(getBootstrapNavbarInk("/")).toBe("dark");
    expect(resolveNavbarChromeMode("/")).toBe("solid");
    expect(getBootstrapNavbarInk("/category/survey-drones")).toBe("light");
    expect(getBootstrapNavbarInk("/products")).toBe("dark");
  });
});
