import { describe, expect, it } from "vitest";
import { loadEnvConfig } from "@next/env";
import { syncAllProductMediaLinks } from "@/lib/media/sync-all-product-media-links";

describe("sync all product media links runner", () => {
  it("ensures product_media_assets links for every product", async () => {
    loadEnvConfig(process.cwd());
    const result = await syncAllProductMediaLinks();
    console.log(JSON.stringify(result, null, 2));
    expect(result.product_count).toBeGreaterThan(0);
  }, 600_000);
});
