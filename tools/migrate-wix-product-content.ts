import { runWixContentMigration } from "../lib/wix-content-migration/runner.ts";

async function main() {
  const result = await runWixContentMigration(process.argv.slice(2));
  if (result.status === "help") return;
  if (result.report && result.report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
