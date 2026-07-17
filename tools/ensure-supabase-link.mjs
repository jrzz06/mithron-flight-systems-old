#!/usr/bin/env node
/**
 * Ensure the Supabase CLI is linked to the hosted project.
 * Reads SUPABASE_PROJECT_REF (+ optional password/token) from .env.local / env.
 *
 * Usage: node tools/ensure-supabase-link.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRefPath = resolve(root, "supabase", ".temp", "project-ref");

function loadEnvLocal() {
  const envPath = resolve(root, ".env.local");
  const map = new Map();
  if (!existsSync(envPath)) return map;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function envValue(fileEnv, key) {
  return (process.env[key]?.trim() || fileEnv.get(key)?.trim() || "");
}

const fileEnv = loadEnvLocal();
const projectRef = envValue(fileEnv, "SUPABASE_PROJECT_REF");
if (!projectRef) {
  console.error(
    "[ensure-supabase-link] SUPABASE_PROJECT_REF is missing from env / .env.local"
  );
  process.exit(1);
}

mkdirSync(dirname(projectRefPath), { recursive: true });

const existingRef = existsSync(projectRefPath)
  ? readFileSync(projectRefPath, "utf8").trim()
  : "";

if (existingRef === projectRef) {
  console.log(`[ensure-supabase-link] Already linked to ${projectRef}`);
  process.exit(0);
}

// Persist project-ref immediately so `db push` can resolve the project even if
// the interactive link step is skipped or partially fails.
writeFileSync(projectRefPath, `${projectRef}\n`, "utf8");

const accessToken = envValue(fileEnv, "SUPABASE_ACCESS_TOKEN");
const dbPassword = envValue(fileEnv, "SUPABASE_DB_PASSWORD");
const args = ["supabase", "link", "--project-ref", projectRef, "--yes"];
if (dbPassword) {
  args.push("--password", dbPassword);
}

const env = { ...process.env };
if (accessToken) env.SUPABASE_ACCESS_TOKEN = accessToken;

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  args,
  {
    cwd: root,
    env,
    stdio: "inherit",
    shell: process.platform === "win32"
  }
);

if (result.status !== 0) {
  console.warn(
    `[ensure-supabase-link] supabase link exited ${result.status}; project-ref written to supabase/.temp/project-ref`
  );
  // project-ref alone is enough for db push when credentials are in env
  process.exit(0);
}

console.log(`[ensure-supabase-link] Linked to ${projectRef}`);
