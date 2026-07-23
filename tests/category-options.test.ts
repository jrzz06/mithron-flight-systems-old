import { describe, expect, it } from "vitest";
import {
  buildProductCategoryOptions,
  ensureCategoryInOptions
} from "@/lib/product-category-options";

describe("product category options", () => {
  it("merges category_metadata with in-use product categories and dedupes casing", () => {
    const options = buildProductCategoryOptions(
      [{ category: "Legacy Category" }, { category: "agri drones" }, { category: "Agri Drones" }],
      [{ title: "Agri drones", route_key: "agriculture", status: "published", is_visible: true }]
    );

    expect(options).toEqual([
      {
        label: "Agri Drones",
        routeKey: "agriculture",
        productCount: 2,
        metadataBacked: true
      },
      {
        label: "Legacy Category",
        routeKey: null,
        productCount: 1,
        metadataBacked: false
      }
    ]);
  });

  it("ensures the current product category remains selectable when missing from metadata", () => {
    const options = ensureCategoryInOptions(
      [{ label: "Agri Drones", routeKey: "agriculture", productCount: 2, metadataBacked: true }],
      "video drones"
    );

    expect(options).toEqual([
      {
        label: "Video Drones",
        routeKey: null,
        productCount: 0,
        metadataBacked: false
      },
      {
        label: "Agri Drones",
        routeKey: "agriculture",
        productCount: 2,
        metadataBacked: true
      }
    ]);
  });
});
