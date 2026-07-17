import { describe, expect, it } from "vitest";
import nextEnv from "@next/env";
import { runExternalProductMediaIngest } from "@/lib/media/run-external-product-media-ingest";

const { loadEnvConfig } = nextEnv;

describe("external product media ingest runner", () => {
  it("runs the migration tool with vitest path aliases", async () => {
    loadEnvConfig(process.cwd());
    const argv = process.env.MEDIA_INGEST_ARGS
      ? process.env.MEDIA_INGEST_ARGS.split(/\s+/).filter(Boolean)
      : ["--all"];

    const report = await runExternalProductMediaIngest(argv);
    expect(report.status === "noop" || report.status === "dry_run" || report.status === "applied").toBe(true);
  }, 1_800_000);
});
