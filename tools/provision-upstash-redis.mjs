#!/usr/bin/env node
/**
 * Provision Upstash Redis via Vercel Marketplace and map env vars to UPSTASH_*.
 *
 * Prerequisites (one-time, interactive / browser):
 *   1. Open https://vercel.com/kbkbkh/~/integrations/accept-terms/upstash?source=cli
 *   2. Accept marketplace terms while logged into the kbkbkh Vercel team
 *   3. Re-run: node tools/provision-upstash-redis.mjs
 *
 * Usage: node tools/provision-upstash-redis.mjs [--dry-run]
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

const root = process.cwd();
const dryRun = process.argv.includes("--dry-run");
const scope = "kbkbkh";
const resourceName = "mithron-auth-redis";

function run(args, opts = {}) {
  const result = spawnSync("npx", ["vercel@latest", ...args], {
    cwd: root,
    encoding: "utf8",
    shell: true,
    ...opts
  });
  return result;
}

function parseEnvFile(path) {
  const entries = new Map();
  if (!existsSync(path)) return entries;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries.set(trimmed.slice(0, index).trim(), value);
  }
  return entries;
}

function upsertEnv(name, value, environment, { sensitive = true } = {}) {
  const args = [
    "env",
    "add",
    name,
    environment,
    "--scope",
    scope,
    "--yes",
    "--value",
    value
  ];
  if (sensitive) args.push("--sensitive");
  else args.push("--no-sensitive");

  let result = run(args);
  if (result.status === 0) {
    console.log(`set ${name} (${environment})`);
    return;
  }

  const updateArgs = [
    "env",
    "update",
    name,
    environment,
    "--scope",
    scope,
    "--yes"
  ];
  const tmp = resolve(root, `.tmp-${name}-${environment}.txt`);
  writeFileSync(tmp, value, "utf8");
  result = spawnSync(
    process.platform === "win32"
      ? `type "${tmp}" | npx vercel@latest ${updateArgs.join(" ")}`
      : `npx vercel@latest ${updateArgs.join(" ")} < "${tmp}"`,
    { cwd: root, encoding: "utf8", shell: true }
  );
  try {
    unlinkSync(tmp);
  } catch {
    // ignore
  }
  if (result.status === 0) {
    console.log(`updated ${name} (${environment})`);
    return;
  }
  console.error(`failed ${name} (${environment}): ${(result.stderr || result.stdout || "").trim()}`);
  process.exitCode = 1;
}

async function main() {
  if (dryRun) {
    console.log("Dry run — would install upstash/upstash-kv and map REST credentials to UPSTASH_*.");
    return;
  }

  console.log("Installing Upstash for Redis via Vercel Marketplace...");
  const install = run([
    "integration",
    "add",
    "upstash/upstash-kv",
    "--name",
    resourceName,
    "--plan",
    "free",
    "-m",
    "primaryRegion=bom1",
    "-e",
    "production",
    "-e",
    "preview",
    "-e",
    "development",
    "--no-env-pull",
    "--scope",
    scope,
    "--format=json"
  ]);

  const combined = `${install.stdout || ""}\n${install.stderr || ""}`.trim();
  console.log(combined);

  if (/integration_terms_acceptance_required|action_required/.test(combined)) {
    console.error(`
Upstash marketplace terms are not accepted yet.

1. Open: https://vercel.com/kbkbkh/~/integrations/accept-terms/upstash?source=cli
2. Accept terms while logged into the kbkbkh team
3. Re-run: npm run provision:upstash
`);
    process.exitCode = 2;
    return;
  }

  if (install.status !== 0) {
    process.exitCode = 1;
    return;
  }

  const pullPath = resolve(root, ".env.vercel-upstash-pull");
  const pull = run([
    "env",
    "pull",
    pullPath,
    "--environment=production",
    "--scope",
    scope,
    "--yes"
  ]);
  if (pull.status !== 0) {
    console.error(pull.stderr || pull.stdout);
    process.exitCode = 1;
    return;
  }

  const pulled = parseEnvFile(pullPath);
  const restUrl =
    pulled.get("KV_REST_API_URL")
    || pulled.get("UPSTASH_REDIS_REST_URL")
    || "";
  const restToken =
    pulled.get("KV_REST_API_TOKEN")
    || pulled.get("UPSTASH_REDIS_REST_TOKEN")
    || "";

  try {
    unlinkSync(pullPath);
  } catch {
    // ignore
  }

  if (!restUrl || !restToken) {
    console.error("Upstash install finished but REST URL/token were not found in pulled env.");
    process.exitCode = 1;
    return;
  }

  for (const environment of ["production", "preview", "development"]) {
    upsertEnv("UPSTASH_REDIS_REST_URL", restUrl, environment, { sensitive: true });
    upsertEnv("UPSTASH_REDIS_REST_TOKEN", restToken, environment, { sensitive: true });
  }

  // Keep local .env.local in sync for developers (append/replace).
  const localPath = resolve(root, ".env.local");
  const local = parseEnvFile(localPath);
  local.set("UPSTASH_REDIS_REST_URL", restUrl);
  local.set("UPSTASH_REDIS_REST_TOKEN", restToken);
  if (!local.get("AUTH_AUDIT_CLIENT_SECRET") || local.get("AUTH_AUDIT_CLIENT_SECRET")?.includes("change-me")) {
    local.set("AUTH_AUDIT_CLIENT_SECRET", randomBytes(32).toString("hex"));
  }

  const lines = [];
  for (const [key, value] of local.entries()) {
    lines.push(`${key}=${value}`);
  }
  // Preserve original order roughly by rewriting known keys into existing file when present.
  if (existsSync(localPath)) {
    let content = readFileSync(localPath, "utf8");
    for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "AUTH_AUDIT_CLIENT_SECRET"]) {
      const value = local.get(key);
      const re = new RegExp(`^${key}=.*$`, "m");
      if (re.test(content)) {
        content = content.replace(re, `${key}=${value}`);
      } else {
        content = `${content.trimEnd()}\n${key}=${value}\n`;
      }
    }
    writeFileSync(localPath, content, "utf8");
  }

  console.log("Upstash Redis provisioned and UPSTASH_* env vars synced.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
