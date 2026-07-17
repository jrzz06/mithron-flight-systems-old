import { describe, expect, it } from "vitest";
import { formatINR } from "@/lib/utils";

describe("formatINR", () => {
  it("formats storefront prices with the Indian Rupee symbol", () => {
    const formatted = formatINR(125000);
    expect(formatted).toContain("₹");
    expect(formatted).not.toContain("$");
    expect(formatted.replace(/\s/g, "")).toMatch(/₹1,25,000/);
  });
});
