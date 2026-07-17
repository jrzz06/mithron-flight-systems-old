import { describe, expect, it } from "vitest";
import { DESKTOP_PURCHASE_MEDIA_QUERY } from "@/hooks/use-desktop-purchase-layout";

describe("product purchase layout", () => {
  it("uses the same breakpoint as the showcase purchase grid", () => {
    expect(DESKTOP_PURCHASE_MEDIA_QUERY).toBe("(min-width: 1024px)");
  });
});
