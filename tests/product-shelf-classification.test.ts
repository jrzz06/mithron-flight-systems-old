import { describe, expect, it } from "vitest";
import {
  classifyProductShelf,
  filterDroneCareProducts,
  filterDroneWorldProducts,
  inferMissionCategory,
  isDroneAircraft,
  isDroneCareProduct,
  isDroneCareShelfProduct,
  isDroneWorldCategory,
  isGlobalProductsCategory,
  resolveHomepageShelf
} from "@/lib/product-shelf-classification";
import { getProducts } from "@/services/catalog";

describe("product shelf classification", () => {
  it("classifies known aircraft as drone world", () => {
    const aircraft = {
      slug: "source-agri-kisan-drone-small-8-liter",
      name: "Agri Kisan Drone Small - 8 Liter",
      tagline: "8-Liter Agri Kisan Drone",
      category: "Agri Drones",
      interests: ["agriculture"],
      specs: { "Product ID": "mithron-agri-kisan-drone-small-8-liter" }
    };

    expect(classifyProductShelf(aircraft)).toBe("drone-world");
    expect(isDroneAircraft(aircraft)).toBe(true);
    expect(isDroneCareProduct(aircraft)).toBe(false);
  });

  it("classifies known accessories as drone care", () => {
    const accessory = {
      slug: "source-6s-24000mah-battery",
      name: "6S 24000mAh Battery",
      tagline: "Field battery pack",
      category: "Accessories",
      interests: ["components"],
      specs: { "Product ID": "mithron-6s-24000mah-battery" }
    };

    expect(classifyProductShelf(accessory)).toBe("drone-care");
    expect(isDroneCareProduct(accessory)).toBe(true);
    expect(isDroneAircraft(accessory)).toBe(false);
  });

  it("does not classify flight controllers as drone world even when named for agriculture drones", () => {
    const controller = {
      slug: "source-v9-flight-controller-for-agriculture-drones",
      name: "V9 Flight Controller for Agriculture Drones",
      tagline: "Agriculture flight controller",
      category: "Accessories",
      interests: ["components"],
      specs: { "Product ID": "mithron-v9-flight-controller-for-agriculture-drones" }
    };

    expect(classifyProductShelf(controller)).toBe("drone-care");
    expect(isDroneAircraft(controller)).toBe(false);
  });

  it("routes Global Products category items to the global-products homepage shelf", () => {
    const globalProducts = [
      {
        slug: "zio",
        name: "ZIO",
        tagline: "ZIO catalog product",
        category: "Global Products",
        interests: [],
        specs: {}
      },
      {
        slug: "pixy-mr",
        name: "Pixy MR",
        tagline: "Pixy MR catalog product",
        category: "Global Products",
        interests: [],
        specs: {}
      },
      {
        slug: "pixy-lr",
        name: "Pixy LR",
        tagline: "Pixy LR catalog product",
        category: "Global Products",
        interests: [],
        specs: {}
      }
    ];

    for (const product of globalProducts) {
      expect(isGlobalProductsCategory(product)).toBe(true);
      expect(isDroneWorldCategory(product)).toBe(false);
      expect(isDroneCareShelfProduct(product)).toBe(false);
      expect(resolveHomepageShelf(product)).toBe("global-products");
    }
  });

  it("keeps heuristic drone world and drone care partitions disjoint on the live catalog", async () => {
    const products = await getProducts();
    const droneWorld = filterDroneWorldProducts(products);
    const droneCare = filterDroneCareProducts(products);
    const worldSlugs = new Set(droneWorld.map((product) => product.slug));
    const careSlugs = new Set(droneCare.map((product) => product.slug));
    const overlap = [...worldSlugs].filter((slug) => careSlugs.has(slug));

    expect(products.length).toBeGreaterThanOrEqual(130);
    expect(droneWorld.length).toBeGreaterThan(20);
    expect(droneCare.length).toBeGreaterThan(50);
    expect(overlap).toEqual([]);
    expect(worldSlugs.size + careSlugs.size).toBe(products.length);
    expect(droneWorld.every((product) => classifyProductShelf(product) === "drone-world")).toBe(true);
    expect(droneCare.every((product) => classifyProductShelf(product) === "drone-care")).toBe(true);
  });

  it("keeps homepage shelves partitioned across global, drone world, and drone care", async () => {
    const products = await getProducts();
    const globalProducts = products.filter(isGlobalProductsCategory);
    const droneWorld = products.filter(isDroneWorldCategory);
    const droneCare = products.filter(isDroneCareShelfProduct);
    const globalSlugs = new Set(globalProducts.map((product) => product.slug));
    const worldSlugs = new Set(droneWorld.map((product) => product.slug));
    const careSlugs = new Set(droneCare.map((product) => product.slug));
    const assignments = products.map((product) => ({
      slug: product.slug,
      shelf: resolveHomepageShelf(product)
    }));

    expect(assignments).toHaveLength(products.length);
    expect(new Set(assignments.map((entry) => entry.slug)).size).toBe(products.length);
    expect([...globalSlugs].filter((slug) => worldSlugs.has(slug))).toEqual([]);
    expect([...globalSlugs].filter((slug) => careSlugs.has(slug))).toEqual([]);
    expect([...worldSlugs].filter((slug) => careSlugs.has(slug))).toEqual([]);
    expect(globalProducts.every((product) => resolveHomepageShelf(product) === "global-products")).toBe(true);
    expect(droneWorld.every((product) => resolveHomepageShelf(product) === "drone-world")).toBe(true);
    expect(droneCare.every((product) => resolveHomepageShelf(product) === "drone-care")).toBe(true);
    expect(assignments.every((entry) => ["global-products", "drone-world", "drone-care"].includes(entry.shelf))).toBe(true);
  });

  it("classifies cinema and agri aircraft as drone world", () => {
    expect(
      classifyProductShelf({
        slug: "source-4k-cinema-drone",
        name: "4K CINEMA DRONE",
        tagline: "Cinema drone",
        category: "Video Drones",
        interests: ["video-drones"],
        specs: {}
      })
    ).toBe("drone-world");

    expect(
      classifyProductShelf({
        slug: "source-15-liters-agri-drone",
        name: "15 Liters Agri Drone",
        tagline: "15 liter agri drone",
        category: "Agri Drones",
        interests: ["agriculture"],
        specs: {}
      })
    ).toBe("drone-world");
  });

  it("documents expected database category corrections for shelf alignment", () => {
    const expectedCorrections = {
      "source-nuno-no-tc-required": "Surveillance Drones",
      "source-monal-4k": "Surveillance Drones",
      "source-monal-4k-thermal": "Surveillance Drones",
      "source-decafly-d5x-battery-frame": "Accessories",
      "source-18-inch-drone-frame": "Accessories",
      "source-siyi-a2-mini-ultra-wide-angle-fpv-gimbal-single-axis-camera-sensor": "Accessories",
      "source-skydroid-h12-with-inbuilt-screen-and-camera-remote-control": "Accessories",
      "source-15-inch-drone-frame": "Accessories",
      "source-decafly-d5x-cfrp-arm-black": "Accessories",
      "source-skydroid-c10-three-axis-gimbal-camera": "Accessories",
      "source-decafly-d5x-3d-printed-arm-white": "Accessories",
      "source-siyi-a8-mini-4k-8mp-ultra-hd-6x-digital-zoom-gimbal-camera": "Accessories",
      "source-decafly-d5x-landing-gear": "Accessories",
      "source-jiyi-terrain-following-radar-for-agriculture-drones": "Accessories",
      "source-skyrc-pc1080-dual-channel-charger-for-agriculture-drone-batteries": "Accessories",
      "source-decafly-d5x-cfrp-frame": "Accessories"
    } as const;

    for (const [slug, category] of Object.entries(expectedCorrections)) {
      expect(inferMissionCategory({
        slug,
        name: slug,
        tagline: "",
        category,
        interests: [],
        specs: {}
      })).toBe(category);
    }
  });

  it("infers mission categories for aircraft and accessories consistently", () => {
    expect(
      inferMissionCategory({
        slug: "source-drone-soccer-200-mm",
        name: "Drone Soccer 200 mm",
        tagline: "Creative drone soccer aircraft",
        category: "Creative Drones",
        interests: ["creative-drones"],
        specs: {}
      })
    ).toBe("Creative Drones");

    expect(
      inferMissionCategory({
        slug: "source-hobbywing-x8-3011-propellers-with-mount-ccw",
        name: "Hobbywing X8 3011 Propellers with Mount CCW",
        tagline: "Replacement propeller set",
        category: "Accessories",
        interests: ["components"],
        specs: {}
      })
    ).toBe("Accessories");
  });
});
