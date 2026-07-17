import { describe, expect, it } from "vitest";
import { buildEnterpriseMenuConfigs } from "@/services/catalog-navigation";
import { getProducts } from "@/services/catalog";

describe("catalog navigation menus", () => {
  it("builds mega menus from live catalog products instead of static arrays", async () => {
    const products = await getProducts();
    const menus = buildEnterpriseMenuConfigs(products);

    expect(menus).toHaveLength(7);
    expect(menus.map((menu) => menu.label)).toEqual([
      "Agri Drones",
      "Video Drones",
      "Creative Drones",
      "Survey Drones",
      "Surveillance Drones",
      "Accessories",
      "Global Products"
    ]);

    const agriMenu = menus.find((menu) => menu.label === "Agri Drones");
    expect(agriMenu?.type).toBe("mega");
    if (agriMenu?.type === "mega") {
      expect(agriMenu.href).toBe("/category/agri-drones");
      expect(agriMenu.columnOne.length).toBeGreaterThan(0);
      expect(agriMenu.columnOne[0]?.href.startsWith("/product/")).toBe(true);
      expect(agriMenu.featured[0]?.href.startsWith("/product/")).toBe(true);
      expect(agriMenu.featured[0]?.image).toBeTruthy();
    }

    const globalMenu = menus.find((menu) => menu.label === "Global Products");
    expect(globalMenu?.type).toBe("mega");
    if (globalMenu?.type === "mega") {
      expect(globalMenu.href).toBe("/category/global-products");
      expect(globalMenu.columnOne.some((item) => item.href.startsWith("/product/"))).toBe(true);
      expect(globalMenu.featured[0]?.href.startsWith("/product/")).toBe(true);
    }
  });
});
