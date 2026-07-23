import { describe, expect, it } from "vitest";
import {
  PRODUCT_OPEN_TRANSITION,
  isProductPath,
  productHref,
  productMediaTransitionName
} from "@/lib/navigation/product-transition";

describe("product transition helpers", () => {
  it("builds stable shared-element names and hrefs", () => {
    expect(PRODUCT_OPEN_TRANSITION).toBe("product-open");
    expect(productHref("agri-x1")).toBe("/product/agri-x1");
    expect(productMediaTransitionName("agri-x1")).toBe("product-media-agri-x1");
    expect(isProductPath("/product/agri-x1")).toBe(true);
    expect(isProductPath("/products")).toBe(false);
  });
});
