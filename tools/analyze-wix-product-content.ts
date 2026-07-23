import { runWixContentMigration } from "../lib/wix-content-migration/runner.ts";

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.includes("--analyze")) argv.push("--analyze");
  const result = await runWixContentMigration(argv);
  if (result.status === "help") return;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
