#!/usr/bin/env node
/**
 * Runs knip + depcheck and writes docs/dead-code-audit/automated-findings.json
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, posix as pathPosix } from "node:path";

const root = process.cwd();
const outDir = join(root, "docs", "dead-code-audit");
const outFile = join(outDir, "automated-findings.json");

const GATED_PATHS = [
  "config/storefront-content.ts",
  "config/cms-deprecations.ts",
  "lib/cms/deprecated-tables.ts"
];

const RUNTIME_PATTERNS = [
  /^app\/api\//,
  /^app\/.+\/page\.tsx$/,
  /^app\/.+\/route\.ts$/,
  /^supabase\/migrations\//,
  /^instrumentation\.ts$/,
  /^proxy\.ts$/,
  /-loader\.tsx$/
];

const DEPCHECK_IGNORE = new Set([
  "@tailwindcss/postcss",
  "tailwindcss",
  "supabase",
  "postcss",
  "eslint-config-next",
  "cross-env",
  "@next/bundle-analyzer",
  "knip",
  "depcheck"
]);

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function listTestFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      listTestFiles(full, acc);
    } else if (/\.(test|spec)\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function buildTestPathIndex() {
  const index = new Map();
  const testDirs = [join(root, "tests"), join(root, "scripts")];
  for (const dir of testDirs) {
    for (const file of listTestFiles(dir)) {
      const content = readFileSync(file, "utf8");
      index.set(normalizePath(file.replace(root + pathPosix.sep, "").replace(/\\/g, "/")), content);
    }
  }
  return index;
}

function isReferencedInTests(filePath, testIndex) {
  const normalized = normalizePath(filePath);
  const basename = normalized.split("/").pop() ?? normalized;
  for (const content of testIndex.values()) {
    if (content.includes(normalized) || content.includes(basename)) {
      return true;
    }
  }
  return false;
}

function isReferencedInPackageScripts(filePath) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const scripts = Object.values(pkg.scripts ?? {}).join(" ");
  const normalized = normalizePath(filePath);
  return scripts.includes(normalized) || scripts.includes(normalized.split("/").pop() ?? "");
}

function classifyPath(filePath, testIndex) {
  const normalized = normalizePath(filePath);
  if (GATED_PATHS.some((g) => normalized.includes(g))) return "GATED";
  if (RUNTIME_PATTERNS.some((re) => re.test(normalized))) return "RUNTIME";
  if (normalized.startsWith("tools/")) return "REVIEW";
  if (normalized.startsWith("tests/")) return "RUNTIME";
  if (isReferencedInTests(normalized, testIndex)) return "REVIEW";
  if (isReferencedInPackageScripts(normalized)) return "REVIEW";
  if (
    normalized.startsWith("scripts/") &&
    (normalized.endsWith(".mjs") || normalized.endsWith(".test.ts"))
  ) {
    return "SAFE";
  }
  if (
    normalized.startsWith("lib/") ||
    normalized.startsWith("services/") ||
    normalized.startsWith("components/") ||
    normalized.startsWith("hooks/") ||
    normalized.startsWith("sections/")
  ) {
    return "SAFE";
  }
  return "REVIEW";
}

function runKnip() {
  try {
    const raw = execSync("npx knip --reporter json", {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024
    });
    return JSON.parse(raw);
  } catch (error) {
    const stdout = error.stdout?.toString?.() ?? "";
    if (stdout.trim().startsWith("{")) {
      return JSON.parse(stdout);
    }
    return { error: String(error.message ?? error), issues: [] };
  }
}

function runDepcheck() {
  try {
    const raw = execSync("npx depcheck --json", {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    });
    return JSON.parse(raw);
  } catch (error) {
    const stdout = error.stdout?.toString?.() ?? "";
    if (stdout.trim().startsWith("{")) {
      return JSON.parse(stdout);
    }
    return { dependencies: [], devDependencies: [], missing: {}, error: String(error.message ?? error) };
  }
}

function extractKnipFindings(knip) {
  const unusedFileSet = new Set();
  const unusedExports = [];

  for (const issue of knip.issues ?? []) {
    for (const file of issue.files ?? []) {
      if (file.name) unusedFileSet.add(normalizePath(file.name));
    }
    for (const exp of issue.exports ?? []) {
      unusedExports.push({
        path: normalizePath(issue.file),
        symbol: exp.name,
        line: exp.line,
        kind: "unused_export"
      });
    }
    for (const typ of issue.types ?? []) {
      unusedExports.push({
        path: normalizePath(issue.file),
        symbol: typ.name,
        line: typ.line,
        kind: "unused_type"
      });
    }
  }

  return {
    unusedFiles: [...unusedFileSet].sort(),
    unusedExports
  };
}

function listRoutes() {
  const pages = execSync('git ls-files "app/**/page.tsx"', { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  const routes = execSync('git ls-files "app/**/route.ts"', { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  return { pages, apiRoutes: routes };
}

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

const testIndex = buildTestPathIndex();
const knip = runKnip();
const depcheck = runDepcheck();
const routeMap = listRoutes();
const { unusedFiles: knipUnusedFiles, unusedExports: knipUnusedExports } = extractKnipFindings(knip);

const unusedFiles = knipUnusedFiles.map((file) => ({
  path: file,
  kind: "unused_file",
  tag: classifyPath(file, testIndex),
  testReferenced: isReferencedInTests(file, testIndex)
}));

const unusedExports = knipUnusedExports.map((entry) => ({
  ...entry,
  tag: classifyPath(entry.path, testIndex)
}));

const unusedDependencies = (depcheck.dependencies ?? [])
  .filter((dep) => !DEPCHECK_IGNORE.has(dep))
  .map((dep) => ({
    name: dep,
    kind: "unused_dependency",
    tag: "REVIEW"
  }));

const unusedDevDependencies = (depcheck.devDependencies ?? [])
  .filter((dep) => !DEPCHECK_IGNORE.has(dep))
  .map((dep) => ({
    name: dep,
    kind: "unused_dev_dependency",
    tag: "REVIEW"
  }));

const depcheckFalsePositives = [
  ...(depcheck.dependencies ?? []).filter((dep) => DEPCHECK_IGNORE.has(dep)),
  ...(depcheck.devDependencies ?? []).filter((dep) => DEPCHECK_IGNORE.has(dep))
].map((name) => ({ name, reason: "Used via config/CLI; depcheck false positive" }));

const safeCandidates = [
  ...unusedFiles.filter((f) => f.tag === "SAFE"),
  ...unusedExports.filter((e) => e.tag === "SAFE"),
  ...unusedDependencies.filter((d) => d.name && !d.name.startsWith("@types/"))
].filter(Boolean);

const findings = {
  generatedAt: new Date().toISOString(),
  summary: {
    unusedFiles: unusedFiles.length,
    unusedExports: unusedExports.length,
    unusedDependencies: unusedDependencies.length,
    unusedDevDependencies: unusedDevDependencies.length,
    safeCandidates: safeCandidates.length,
    reviewQueue:
      unusedFiles.filter((f) => f.tag === "REVIEW").length +
      unusedExports.filter((e) => e.tag === "REVIEW").length +
      unusedDependencies.length +
      unusedDevDependencies.length,
    runtimeOrGated:
      unusedFiles.filter((f) => f.tag === "RUNTIME" || f.tag === "GATED").length,
    testReferencedUnusedFiles: unusedFiles.filter((f) => f.testReferenced).length
  },
  routeMap,
  knip: {
    files: unusedFiles,
    exports: unusedExports.slice(0, 500)
  },
  depcheck: {
    unusedDependencies,
    unusedDevDependencies,
    falsePositives: depcheckFalsePositives,
    missing: depcheck.missing ?? {}
  },
  safeCandidates,
  reviewQueue: [
    ...unusedFiles.filter((f) => f.tag === "REVIEW"),
    ...unusedExports.filter((e) => e.tag === "REVIEW").slice(0, 200),
    ...unusedDependencies.map((d) => ({ ...d, path: `package.json#${d.name}` })),
    ...unusedDevDependencies.map((d) => ({ ...d, path: `package.json#${d.name}` }))
  ]
};

writeFileSync(outFile, `${JSON.stringify(findings, null, 2)}\n`, "utf8");
console.log(`Wrote ${outFile}`);
console.log(JSON.stringify(findings.summary, null, 2));
