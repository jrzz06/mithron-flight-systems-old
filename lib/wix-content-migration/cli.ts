export type MigrateCliOptions = {
  apply: boolean;
  analyze: boolean;
  confirm: string | null;
  refreshWix: boolean;
  resume: string | null;
  runId: string | null;
  slug: string | null;
  limit: number;
  batchSize: number;
  continueOnError: boolean;
  wixPath: string | null;
  help: boolean;
};

export function printMigrationHelp() {
  console.log(`Safe Wix → Supabase product content migration

Usage:
  npm run products:migrate-wix-content:analyze -- [--refresh-wix]
  npm run products:migrate-wix-content -- [options]
  npm run products:migrate-wix-content:apply -- --confirm=MIGRATE [options]
  npm run products:migrate-wix-content:validate -- [--run-id=<id>]
  npm run products:migrate-wix-content:rollback -- --run-id=<id> [--slug=<slug>]
  npm run products:migrate-wix-content:approve-delete-cutouts -- --run-id=<id> --confirm=DELETE_CUTOUTS

Phases:
  1) Analysis dry-run (no writes) — matching + gap report
  2) Backup before every live product update
  3) Image migration — re-host Wix originals; archive cutouts (never delete Storage)
  4) Description + specs migration
  5) Per-product validation + auto-rollback on failure
  6) Success / failed reports with rates

Options:
  --analyze               Phase 1 matching/gap analysis only (no downloads, no writes)
  --apply                 Write changes (requires --confirm=MIGRATE)
  --confirm=MIGRATE       Explicit live confirmation token
  --refresh-wix           Fetch a fresh Wix catalog snapshot before migrating
  --resume=<runId>        Continue from a previous run checkpoint
  --run-id=<id>           Explicit run id (default: auto-generated)
  --slug=<slug>           Migrate a single product slug
  --limit=<n>             Cap number of products processed
  --batch-size=<n>        Batch size (default 20, max 50)
  --continue-on-error     Continue after recoverable product failures (default)
  --stop-on-error         Stop when a product fails
  --wix=<path>            Path to wix-catalog.snapshot.json
  --help                  Show this help

Safety:
  - Default mode is dry-run (no writes)
  - Never updates price, inventory, category, slug, IDs, workflow_status, auth, orders, or users
  - Never deletes cutout Storage objects automatically
  - Archives previous primary/gallery links under cms backup variant
  - Fully reversible via rollback backups

Runbook:
  1) npm run products:fetch-wix
  2) npm run products:migrate-wix-content:analyze
  3) npm run products:migrate-wix-content
  4) Pilot: npm run products:migrate-wix-content:apply -- --confirm=MIGRATE --slug=<slug>
  5) Full:  npm run products:migrate-wix-content:apply -- --confirm=MIGRATE --batch-size=20
  6) npm run products:migrate-wix-content:validate
  7) ONLY THEN (optional): npm run products:migrate-wix-content:approve-delete-cutouts -- --run-id=<id> --apply --confirm=DELETE_CUTOUTS
`);
}

export function parseMigrateCliArgs(argv: string[]): MigrateCliOptions {
  const getValue = (prefix: string) => {
    const hit = argv.find((arg) => arg.startsWith(prefix));
    return hit ? hit.slice(prefix.length).trim() : null;
  };

  const batchRaw = Number(getValue("--batch-size=") ?? "20");
  const batchSize = Number.isFinite(batchRaw) ? Math.min(50, Math.max(20, Math.floor(batchRaw))) : 20;
  const limitRaw = Number(getValue("--limit=") ?? "0");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 0;

  return {
    apply: argv.includes("--apply"),
    analyze: argv.includes("--analyze"),
    confirm: getValue("--confirm="),
    refreshWix: argv.includes("--refresh-wix"),
    resume: getValue("--resume="),
    runId: getValue("--run-id="),
    slug: getValue("--slug="),
    limit,
    batchSize,
    continueOnError: !argv.includes("--stop-on-error"),
    wixPath: getValue("--wix="),
    help: argv.includes("--help") || argv.includes("-h")
  };
}
