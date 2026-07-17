#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const data = JSON.parse(readFileSync(join(root, "docs/dead-code-audit/automated-findings.json"), "utf8"));
const items = data.safeCandidates.filter(
  (candidate) => candidate.symbol && (candidate.kind === "unused_export" || candidate.kind === "unused_type")
);

let changed = 0;
let skipped = 0;

for (const item of items) {
  const file = item.path.replace(/\\/g, "/");
  if (!existsSync(join(root, file))) {
    skipped += 1;
    continue;
  }

  const escaped = item.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    const hits = execSync(`rg -l "\\b${escaped}\\b" --glob "!${file}" .`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (hits) {
      skipped += 1;
      continue;
    }
  } catch {
    // no external references
  }

  const source = readFileSync(join(root, file), "utf8");
  const replacements = [
    [`export type ${item.symbol}`, `type ${item.symbol}`],
    [`export async function ${item.symbol}`, `async function ${item.symbol}`],
    [`export function ${item.symbol}`, `function ${item.symbol}`],
    [`export const ${item.symbol}`, `const ${item.symbol}`]
  ];

  let next = source;
  for (const [from, to] of replacements) {
    if (next.includes(from)) {
      next = next.replace(from, to);
      break;
    }
  }

  if (next === source) {
    skipped += 1;
    continue;
  }

  writeFileSync(join(root, file), next);
  changed += 1;
  console.log(`pruned ${item.symbol} in ${file}`);
}

console.log(`done changed=${changed} skipped=${skipped}`);
