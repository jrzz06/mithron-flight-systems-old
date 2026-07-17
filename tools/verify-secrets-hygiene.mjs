#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const envLocal = join(root, ".env.local");
let exitCode = 0;

const FORBIDDEN_TRACKED = [".env.local", ".env", ".cursor/mcp.json"];
const SECRET_PATTERNS = [
  { name: "Supabase JWT", regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { name: "Supabase PAT", regex: /sbp_[a-f0-9]{40,}/gi },
  { name: "Wix API key", regex: /IST\.ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { name: "GitHub token", regex: /gho_[A-Za-z0-9]{20,}/g },
  { name: "Hardcoded live password", regex: /password:\s*["'][^"']{8,}["']/g }
];

function isEnvVarNamePasswordLiteral(match) {
  const inner = match.match(/password:\s*["']([^"']+)["']/)?.[1];
  if (!inner) return false;
  if (!/^[A-Z][A-Z0-9_]*$/.test(inner)) return false;
  return (
    inner.startsWith("E2E_")
    || inner.endsWith("_PASSWORD")
    || inner.endsWith("_SECRET")
    || inner.endsWith("_KEY")
    || inner.endsWith("_TOKEN")
  );
}

function fail(message) {
  console.error(`[secrets-hygiene] FAIL: ${message}`);
  exitCode = 1;
}

function pass(message) {
  console.log(`[secrets-hygiene] OK: ${message}`);
}

function trackedFiles() {
  return execSync("git ls-files -z", { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

try {
  const ignoreCheck = execSync("git check-ignore -v .env.local", { cwd: root, encoding: "utf8" }).trim();
  if (ignoreCheck) {
    pass(`.env.local is gitignored (${ignoreCheck})`);
  } else {
    fail(".env.local is not ignored by git");
  }
} catch {
  fail("git check-ignore failed — is this a git repository?");
}

for (const path of FORBIDDEN_TRACKED) {
  try {
    execSync(`git ls-files --error-unmatch ${path}`, { cwd: root, stdio: "pipe" });
    fail(`${path} is tracked by git — remove it immediately`);
  } catch {
    pass(`${path} is not tracked`);
  }
}

try {
  const history = execSync("git log --all --full-history --oneline -- .env.local", {
    cwd: root,
    encoding: "utf8"
  }).trim();
  if (history) {
    fail(".env.local appears in git history — rotate all secrets immediately");
    console.error(history);
  } else {
    pass(".env.local has never been committed");
  }
} catch {
  fail("unable to inspect .env.local git history");
}

if (existsSync(envLocal)) {
  pass(".env.local exists locally (expected for development only)");
} else {
  console.warn("[secrets-hygiene] WARN: .env.local not found — use .env.example as a template");
}

if (!trackedFiles().includes(".env.example")) {
  fail(".env.example is not tracked — commit the env template for deploys");
}

for (const file of trackedFiles()) {
  if (file.endsWith(".env.example") || file.includes("node_modules/")) continue;
  const content = readFileSync(join(root, file), "utf8");
  for (const pattern of SECRET_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (!matches) continue;
    const filtered = matches.filter((value) => {
      if (value.includes("...") || value.includes("YOUR_")) return false;
      if (pattern.name === "Hardcoded live password" && isEnvVarNamePasswordLiteral(value)) return false;
      return true;
    });
    if (filtered.length > 0) {
      fail(`${pattern.name} pattern found in tracked file ${file}`);
    }
  }
}

if (exitCode === 0) {
  pass("no secret patterns detected in tracked source files");
}

if (process.env.NODE_ENV === "production" && existsSync(envLocal)) {
  console.warn(
    "[secrets-hygiene] WARN: .env.local present in production runtime — prefer platform env vars (Vercel/Railway/Supabase)"
  );
}

process.exit(exitCode);
