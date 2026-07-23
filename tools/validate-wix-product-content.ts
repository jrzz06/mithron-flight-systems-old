import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  createSupabaseAdminClient,
  fetchMigrationProducts,
  loadProjectEnv
} from "../lib/wix-content-migration/runner.ts";
import { matchProductForContentMigration } from "../lib/wix-content-migration/match.ts";
import { parseWixProductContent } from "../lib/wix-content-migration/parse-content.ts";
import { defaultWixSnapshotPath, reportPath, createRunId } from "../lib/wix-content-migration/paths.ts";
import { isWixStaticUrl } from "../lib/media/is-blocked-external-media-url.ts";
import type { WixCatalogSnapshot } from "../lib/wix/catalog-client.ts";

function parseArgs(argv: string[]) {
  const getValue = (prefix: string) => {
    const hit = argv.find((arg) => arg.startsWith(prefix));
    return hit ? hit.slice(prefix.length).trim() : null;
  };
  return {
    runId: getValue("--run-id=") || createRunId("wix-content-validate"),
    wixPath: getValue("--wix=") || defaultWixSnapshotPath(),
    slug: getValue("--slug="),
    help: argv.includes("--help") || argv.includes("-h")
  };
}

function printHelp() {
  console.log(`Validate Wix content migration results

Usage:
  npm run products:migrate-wix-content:validate -- [--run-id=<id>] [--wix=<path>] [--slug=<slug>]

Checks:
  - matched products have non-empty description when Wix has overview
  - description_json is a TipTap doc
  - specs is an object
  - product image/hero/gallery URLs are not wixstatic
  - primary/gallery links exist when gallery JSON is present
`);
}

function readMediaSrc(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const src = (value as { src?: unknown }).src;
  return typeof src === "string" ? src.trim() : "";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  loadProjectEnv();
  if (!existsSync(options.wixPath)) {
    throw new Error(`Wix snapshot not found: ${options.wixPath}`);
  }

  const wixCatalog = JSON.parse(readFileSync(options.wixPath, "utf8")) as WixCatalogSnapshot;
  const supabase = createSupabaseAdminClient();
  let rows = await fetchMigrationProducts(supabase);
  if (options.slug) rows = rows.filter((row) => row.slug === options.slug);

  const issues: Array<{ slug: string; code: string; detail: string }> = [];
  let checked = 0;

  for (const row of rows) {
    const match = matchProductForContentMigration(row, wixCatalog.products);
    if ("error" in match) continue;
    checked += 1;

    const expected = parseWixProductContent(match.wix);
    const description = String(row.description ?? "").trim();
    const descriptionJson = row.description_json as { type?: string } | null;

    if (expected.overview.trim() && !description) {
      issues.push({ slug: row.slug, code: "missing_description", detail: "DB description empty but Wix overview exists" });
    }

    if (descriptionJson && descriptionJson.type !== "doc") {
      issues.push({ slug: row.slug, code: "invalid_description_json", detail: "description_json.type is not doc" });
    }

    if (row.specs && (typeof row.specs !== "object" || Array.isArray(row.specs))) {
      issues.push({ slug: row.slug, code: "invalid_specs_shape", detail: "specs must be an object" });
    }

    const mediaSrcs = [
      readMediaSrc(row.image),
      readMediaSrc(row.hero),
      ...(Array.isArray(row.gallery) ? row.gallery.map((item) => readMediaSrc(item)) : [])
    ].filter(Boolean);

    for (const src of mediaSrcs) {
      if (isWixStaticUrl(src)) {
        issues.push({ slug: row.slug, code: "wixstatic_url", detail: src });
      }
    }

    if (mediaSrcs.length) {
      const { data: links, error } = await supabase
        .from("product_media_assets")
        .select("usage,sort_order,is_primary")
        .eq("product_slug", row.slug)
        .in("usage", ["primary", "gallery"])
        .order("sort_order", { ascending: true });

      if (error) {
        issues.push({ slug: row.slug, code: "media_link_read_failed", detail: error.message });
      } else if (!(links ?? []).some((link) => link.usage === "primary" || link.is_primary)) {
        issues.push({ slug: row.slug, code: "missing_primary_link", detail: "No primary product_media_assets row" });
      }
    }
  }

  const report = {
    version: 1,
    generated_at: new Date().toISOString(),
    run_id: options.runId,
    mode: "VALIDATION",
    summary: {
      checked,
      issue_count: issues.length,
      unique_slugs_with_issues: new Set(issues.map((item) => item.slug)).size
    },
    issues
  };

  const outPath = reportPath(options.runId, "validation");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`report=${outPath}`);
  if (issues.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
