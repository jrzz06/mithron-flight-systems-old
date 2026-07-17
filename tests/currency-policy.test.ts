import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildEnterpriseMenuConfigs } from "@/services/catalog-navigation";
import { formatFromINR, formatINR } from "@/lib/utils";
import { getProducts } from "@/services/catalog";

describe("currency policy", () => {
  it("formats INR with Indian numbering groups", () => {
    expect(formatINR(999)).toMatch(/₹\s?999/);
    expect(formatINR(12500)).toMatch(/₹\s?12,500/);
    expect(formatINR(125000)).toMatch(/₹\s?1,25,000/);
    expect(formatINR(1250000)).toMatch(/₹\s?12,50,000/);
    expect(formatINR(12000000)).toMatch(/₹\s?1,20,00,000/);
    expect(formatINR(125000)).not.toContain("$");
    expect(formatINR(1250.5)).toMatch(/₹\s?1,250\.50/);
    expect(formatINR(1250)).not.toContain(".00");
  });

  it("formats catalog list prices with From + INR", () => {
    expect(formatFromINR(452000)).toContain("From");
    expect(formatFromINR(452000)).toContain("₹");
    expect(formatFromINR(452000)).not.toContain("$");
  });

  it("builds mega menu featured prices without dollar symbols", async () => {
    const products = await getProducts();
    const menus = buildEnterpriseMenuConfigs(products);

    for (const menu of menus) {
      if (menu.type !== "mega" && menu.type !== "franchise") continue;
      const cards = menu.type === "mega" ? menu.featured : [menu.card];
      for (const card of cards) {
        for (const spec of card.specs) {
          expect(spec.value).not.toContain("$");
          expect(spec.value).not.toMatch(/\bUSD\b/);
        }
      }
    }

    const surveillance = menus.find((menu) => menu.label === "Surveillance Drones");
    expect(surveillance?.type).toBe("mega");
    if (surveillance?.type !== "mega") return;

    const hasInrPrice = surveillance.featured.some((card) =>
      card.specs.some((spec) => spec.label === "Price" && spec.value.includes("₹"))
    );
    const productsWithoutSpecs = products.filter((product) => !Object.keys(product.specs ?? {}).length);
    if (productsWithoutSpecs.length) {
      expect(hasInrPrice).toBe(true);
    }
  });

  it("passes repository currency policy validation", () => {
    const output = execFileSync("node", ["tools/validate-currency-policy.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    const report = JSON.parse(output) as { status: string; violationCount: number };
    expect(report.status).toBe("PASSED");
    expect(report.violationCount).toBe(0);
  });
});
