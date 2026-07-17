import { describe, expect, it } from "vitest";
import nextEnv from "@next/env";
import { runBackfillCatalogCutouts } from "@/lib/media/run-backfill-catalog-cutouts";

const { loadEnvConfig } = nextEnv;

describe("backfill catalog cutouts runner", () => {
  it("runs dry-run against published products", async () => {
    loadEnvConfig(process.cwd());
    const argv = process.env.MEDIA_CUTOUT_ARGS
      ? process.env.MEDIA_CUTOUT_ARGS.split(/\s+/).filter(Boolean)
      : ["--limit=5"];

    const report = await runBackfillCatalogCutouts(argv);
    expect(["noop", "dry_run", "applied"]).toContain(report.status);
    expect(report.productCount).toBeGreaterThan(0);
  }, 1_800_000);
});
