import { describe, expect, it } from "vitest";
import {
  categoryPathNavbarInk,
  getBootstrapNavbarInk,
  HOMEPAGE_BOOTSTRAP_SLIDE_ID,
  homepageSlideNavbarInk,
  resolveCategoryNavbarInk,
  resolveCategoryNavbarInkByCmsRouteKey,
  resolveHomepageSlideNavbarInk
} from "@/config/navbar-ink-registry";

describe("navbar ink registry", () => {
  it("defines ink for all three homepage carousel slides", () => {
    expect(homepageSlideNavbarInk["ag10-arrival"]).toBe("light");
    expect(homepageSlideNavbarInk["mapping-flight"]).toBe("light");
    expect(homepageSlideNavbarInk["drone-ecosystem"]).toBe("light");
  });

  it("defines ink for all seven category showcase paths", () => {
    expect(Object.keys(categoryPathNavbarInk)).toHaveLength(7);
    expect(categoryPathNavbarInk["/category/agri-drones"]).toBe("dark");
    expect(categoryPathNavbarInk["/category/video-drones"]).toBe("dark");
    expect(categoryPathNavbarInk["/category/global-products"]).toBe("dark");
    expect(Object.values(categoryPathNavbarInk).every((ink) => ink === "dark")).toBe(true);
  });

  it("resolves homepage slide ink with light fallback", () => {
    expect(resolveHomepageSlideNavbarInk("ag10-arrival")).toBe("light");
    expect(resolveHomepageSlideNavbarInk("unknown-slide")).toBe("light");
  });

  it("resolves category ink by path and cms route key", () => {
    expect(resolveCategoryNavbarInk("/category/video-drones")).toBe("dark");
    expect(resolveCategoryNavbarInk("/category/agri-drones")).toBe("dark");
    expect(resolveCategoryNavbarInkByCmsRouteKey("videoDrones")).toBe("dark");
    expect(resolveCategoryNavbarInkByCmsRouteKey("agriculture")).toBe("dark");
    expect(resolveCategoryNavbarInkByCmsRouteKey("unknown")).toBeNull();
  });

  it("uses first homepage slide ink for bootstrap on /", () => {
    expect(HOMEPAGE_BOOTSTRAP_SLIDE_ID).toBe("ag10-arrival");
    expect(getBootstrapNavbarInk("/")).toBe(homepageSlideNavbarInk[HOMEPAGE_BOOTSTRAP_SLIDE_ID]);
    expect(getBootstrapNavbarInk("/category/survey-drones")).toBe("dark");
    expect(getBootstrapNavbarInk("/products")).toBe("dark");
  });
});
