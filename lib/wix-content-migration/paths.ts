import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function migrationRootDir() {
  return join(root, "data", "wix-content-migration");
}

export function backupsDir(runId: string) {
  return join(migrationRootDir(), "backups", runId);
}

export function backupPath(runId: string, slug: string) {
  return join(backupsDir(runId), `${slug}.json`);
}

export function runsDir(runId: string) {
  return join(migrationRootDir(), "runs", runId);
}

export function checkpointPath(runId: string) {
  return join(runsDir(runId), "checkpoint.json");
}

export function reportsDir() {
  return join(migrationRootDir(), "reports");
}

export function reportPath(runId: string, mode: "dry-run" | "applied" | "validation" | "analysis" | "manual-review") {
  return join(reportsDir(), `${runId}-${mode}.json`);
}

export function defaultWixSnapshotPath() {
  return join(root, "data", "wix-catalog.snapshot.json");
}

export function projectRoot() {
  return root;
}

export function contentFingerprint(input: {
  wixProductId: string;
  overviewHtml: string;
  specs: Array<{ key: string; value: string }>;
  imageUrls: string[];
}) {
  const payload = JSON.stringify({
    wixProductId: input.wixProductId,
    overviewHtml: input.overviewHtml,
    specs: input.specs,
    imageUrls: input.imageUrls
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

export function createRunId(prefix = "wix-content") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stamp}`;
}
