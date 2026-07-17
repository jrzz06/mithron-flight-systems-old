import { describe, expect, it } from "vitest";
import {
  loadVerifyProjectEnv,
  verifyProductMediaSupabase
} from "@/lib/media/verify-product-media-supabase";

describe("verify product media supabase runner", () => {
  it("verifies product media mapping", async () => {
    loadVerifyProjectEnv();
    const argv = process.env.MEDIA_VERIFY_ARGS
      ? process.env.MEDIA_VERIFY_ARGS.split(/\s+/).filter(Boolean)
      : [];

    const result = await verifyProductMediaSupabase(argv);
    console.log(JSON.stringify({
      status: result.status,
      product_count: result.product_count,
      violation_count: result.violation_count,
      report_path: result.report_path
    }, null, 2));

    expect(["passed", "failed"]).toContain(result.status);
    if (result.status === "failed") {
      throw new Error(`Product media verification failed with ${result.violation_count} violations. See ${result.report_path}`);
    }
  }, 600_000);
});
