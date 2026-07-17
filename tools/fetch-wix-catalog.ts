import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchWixCatalog, loadWixClientFromEnv } from "../lib/wix/catalog-client.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(root, "data", "wix-catalog.snapshot.json");

function loadProjectEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(envPath)) continue;
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [name, ...parts] = trimmed.split("=");
      if (!name || process.env[name]) continue;
      process.env[name] = parts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  loadProjectEnv();
  const client = loadWixClientFromEnv();

  console.log(`Fetching Wix catalog for site ${client.siteId}...`);
  const snapshot = await fetchWixCatalog(client);

  if (dryRun) {
    console.log(`Dry run: would write ${snapshot.product_count} products to ${outputPath}`);
    console.log(`Sample: ${snapshot.products.slice(0, 3).map((p) => p.name).join(", ")}`);
    return;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Wrote ${snapshot.product_count} products to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
