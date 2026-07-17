#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const CANONICAL_HOST = "www.mithron.co";
const VERCEL_PRODUCTION_HOST = "final-mithron-deploy.vercel.app";
const ALLOWED_HOSTS = new Set([CANONICAL_HOST, VERCEL_PRODUCTION_HOST]);

function runVercel(args) {
  return spawnSync("vercel", args, { encoding: "utf8", shell: true });
}

const list = runVercel(["alias", "ls"]);
if (list.status !== 0) {
  console.error((list.stderr ?? list.stdout ?? "").trim());
  process.exit(list.status ?? 1);
}

const output = list.stdout ?? "";
const hosts = [...new Set(output.match(/[\w-]+\.vercel\.app/g) ?? [])];
const obsolete = hosts.filter((host) => !ALLOWED_HOSTS.has(host));

if (!obsolete.length) {
  console.log(`canonical production URL: https://${CANONICAL_HOST}`);
  console.log(`vercel production URL: https://${VERCEL_PRODUCTION_HOST}`);
  console.log("no obsolete aliases to remove");
  process.exit(0);
}

for (const alias of obsolete) {
  const removed = runVercel(["alias", "remove", alias, "--yes"]);
  const message = `${removed.stdout ?? ""}${removed.stderr ?? ""}`.trim();
  if (removed.status === 0) {
    console.log(`removed ${alias}`);
    continue;
  }

  console.error(`failed to remove ${alias}: ${message}`);
}

const remaining = runVercel(["alias", "ls"]);
const remainingHosts = [...new Set((remaining.stdout ?? "").match(/[\w-]+\.vercel\.app/g) ?? [])];

console.log(`canonical production URL: https://${CANONICAL_HOST}`);
console.log(`vercel production URL: https://${VERCEL_PRODUCTION_HOST}`);
console.log(`public aliases remaining: ${remainingHosts.join(", ") || VERCEL_PRODUCTION_HOST}`);
