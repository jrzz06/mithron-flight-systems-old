import { describe, expect, it } from "vitest";
import {
  buildProductCategoryOptions,
  ensureCategoryInOptions
} from "@/lib/product-category-options";

describe("product category options", () => {
  it("merges category_metadata with in-use product categories", () => {
    const options = buildProductCategoryOptions(
      [{ category: "Legacy Category" }, { category: "Agri Drones" }],
      [{ title: "Agri Drones", route_key: "agri-drones", status: "published", is_visible: true }]
    );

    expect(options).toEqual([
      {
        label: "Agri Drones",
        routeKey: "agri-drones",
        productCount: 1,
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
      [{ label: "Agri Drones", routeKey: "agri-drones", productCount: 2, metadataBacked: true }],
      "Legacy Category"
    );

    expect(options).toEqual([
      {
        label: "Legacy Category",
        routeKey: null,
        productCount: 0,
        metadataBacked: false
      },
      {
        label: "Agri Drones",
        routeKey: "agri-drones",
        productCount: 2,
        metadataBacked: true
      }
    ]);
  });
});
