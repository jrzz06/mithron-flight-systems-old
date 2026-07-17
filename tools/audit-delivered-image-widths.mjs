#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const workspaceRoot = process.cwd();
const allowedDirectUses = new Set([
  "components/media/mithron-responsive-image.tsx",
  "components/media/mithron-mission-tile-image.tsx",
  "components/media/mithron-shelf-hero-image.tsx",
  "components/media/mithron-thumb-image.tsx",
  "components/media/mithron-card-image.tsx",
  "components/media/mithron-page-hero-image.tsx"
]);

const roleWrappedComponents = [
  "MithronThumbImage",
  "MithronCardImage",
  "MithronPageHeroImage",
  "MithronShelfHeroImage",
  "MithronMissionTileImage"
];

function collectSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      if (["node_modules", ".next", "test-results", ".git"].includes(entry)) continue;
      files.push(...collectSourceFiles(absolutePath));
      continue;
    }
    if (/\.(tsx|ts)$/.test(entry)) files.push(absolutePath);
  }
  return files;
}

function auditFile(filePath) {
  const relativePath = relative(workspaceRoot, filePath).replace(/\\/g, "/");
  if (allowedDirectUses.has(relativePath)) return [];
  const source = readFileSync(filePath, "utf8");
  if (!source.includes("MithronResponsiveImage")) return [];

  const issues = [];
  if (source.includes("<MithronResponsiveImage")) {
    issues.push({
      file: relativePath,
      issue: "Uses uncapped MithronResponsiveImage instead of a role wrapper or imageRole prop"
    });
  }
  return issues;
}

function main() {
  const sourceRoots = ["components", "sections", "app", "features"];
  const files = sourceRoots.flatMap((root) => collectSourceFiles(join(workspaceRoot, root)));
  const issues = files.flatMap(auditFile);

  const summary = {
    roleWrappedComponents,
    scannedFiles: files.length,
    issueCount: issues.length,
    issues
  };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(issues.length ? 1 : 0);
  }

  console.log(`Scanned ${summary.scannedFiles} source files.`);
  console.log(`Role-wrapped components: ${roleWrappedComponents.join(", ")}`);
  if (!issues.length) {
    console.log("No uncapped MithronResponsiveImage usages found outside media primitives.");
    process.exit(0);
  }

  for (const issue of issues) {
    console.log(`- ${issue.file}: ${issue.issue}`);
  }
  process.exit(1);
}

main();
