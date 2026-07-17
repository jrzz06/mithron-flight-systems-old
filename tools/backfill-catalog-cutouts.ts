import nextEnv from "@next/env";
import { runBackfillCatalogCutouts } from "../lib/media/run-backfill-catalog-cutouts.ts";

const { loadEnvConfig } = nextEnv;

async function main() {
  loadEnvConfig(process.cwd());
  const report = await runBackfillCatalogCutouts(process.argv.slice(2));
  console.log(JSON.stringify(report, null, 2));
  if (report.rejected > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
