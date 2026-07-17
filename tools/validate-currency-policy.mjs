import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".md", ".sql", ".cjs", ".mjs"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "coverage", "playwright-report", "test-results"]);
const SKIP_FILES = new Set([
  "package-lock.json",
  "tools/validate-currency-policy.mjs",
  "CURRENCY_AUDIT_REPORT.md"
]);

const ALLOWLIST_LINE_PATTERNS = [
  /\$\{/, // template interpolation
  /\$[0-9]+\$[0-9]+/, // regex replacement groups
  /replace\([^)]*\$[0-9]/, // String.replace capture refs
  /format\([^)]*\$[0-9]/, // SQL format() placeholders
  /encodeURIComponent/,
  /parseProductPrice\(/,
  /\.replace\(\/[^/]*\$\[/, // strip legacy currency symbols on input
  /not\.toContain\("\$"\)/, // negative assertion in tests
  /FORBIDDEN_PATTERNS/,
  /ALLOWLIST_LINE_PATTERNS/,
  /currency policy/i,
  /legacy.*\$.*input/i
];

const FORBIDDEN_PATTERNS = [
  { id: "from-usd-display", pattern: /From \$/g, message: "USD display prefix (use formatFromINR)" },
  { id: "usd-code", pattern: /\bUSD\b/g, message: "USD currency code" },
  { id: "us-dollar", pattern: /US Dollar/gi, message: "US Dollar label" },
  { id: "dollar-label", pattern: /\bDollar\b/g, message: "Dollar label" },
  { id: "usd-currency-setting", pattern: /currency\s*[:=]\s*["']USD["']/gi, message: "USD currency setting" },
  { id: "price-currency-usd", pattern: /priceCurrency\s*[:=]\s*["']USD["']/gi, message: "Schema priceCurrency USD" },
  { id: "dollar-template-price", pattern: /`From \$\$\{/g, message: "Template literal dollar price prefix" },
  { id: "quoted-usd-price", pattern: /["']From \$[0-9]/g, message: "Quoted From $ price string" },
  { id: "quoted-dollar-amount", pattern: /["']\$[0-9]{3,}/g, message: "Quoted dollar-prefixed amount (3+ digits)" }
];

function shouldScanFile(filePath) {
  const rel = relative(root, filePath).replace(/\\/g, "/");
  if (SKIP_FILES.has(rel)) return false;
  const ext = rel.slice(rel.lastIndexOf("."));
  return SCAN_EXTENSIONS.has(ext);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(root, full).replace(/\\/g, "/");
    if (SKIP_DIRS.has(entry) || rel.startsWith("node_modules/")) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (shouldScanFile(full)) files.push(full);
  }
  return files;
}

function isAllowlistedLine(line) {
  return ALLOWLIST_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

function scanFile(filePath) {
  const rel = relative(root, filePath).replace(/\\/g, "/");
  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const hits = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isAllowlistedLine(line)) continue;

    for (const rule of FORBIDDEN_PATTERNS) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(line)) {
        hits.push({
          file: rel,
          line: index + 1,
          rule: rule.id,
          message: rule.message,
          excerpt: line.trim().slice(0, 160)
        });
      }
    }
  }

  return hits;
}

function main() {
  const files = walk(root);
  const violations = files.flatMap(scanFile);
  const filesWithDollar = [...new Set(violations.map((hit) => hit.file))].sort();

  const report = {
    status: violations.length ? "FAILED" : "PASSED",
    scannedFiles: files.length,
    violationCount: violations.length,
    filesWithViolations: filesWithDollar,
    violations
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(violations.length ? 1 : 0);
}

main();
