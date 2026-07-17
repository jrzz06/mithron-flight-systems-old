import nextEnv from "@next/env";
import {
  parseExternalMediaIngestCliArgs,
  runExternalProductMediaIngest
} from "../lib/media/run-external-product-media-ingest.ts";

const { loadEnvConfig } = nextEnv;

export const parseCliArgs = parseExternalMediaIngestCliArgs;

async function main() {
  loadEnvConfig(process.cwd());
  const report = await runExternalProductMediaIngest(process.argv.slice(2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
