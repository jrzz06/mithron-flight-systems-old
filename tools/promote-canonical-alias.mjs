#!/usr/bin/env node
/**
 * Point all sticky production aliases at the latest READY production deployment.
 * Git-linked Vercel deploys update branch aliases automatically but custom domains
 * and the canonical final-mithron-deploy alias can remain pinned to older builds.
 */
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PROJECT = "mithron-flight-systems";
const SCOPE = "kbkbkh";
const MAX_ATTEMPTS = 24;
const RETRY_MS = 15_000;

/** Every host that must serve the same latest production deployment. */
const PRODUCTION_ALIASES = [
  "final-mithron-deploy.vercel.app",
  "www.rtacademia.com",
  "rtacademia.com",
  "mithron-flight-systems-kbkbkh.vercel.app",
  "mithron-flight-systems-jrzz06-kbkbkh.vercel.app",
  "mithron-flight-systems-git-main-kbkbkh.vercel.app"
];

function run(args) {
  const result = spawnSync("npx", ["vercel", ...args], {
    encoding: "utf8",
    shell: true,
    env: process.env
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function latestProductionDeploymentUrl() {
  const listed = run(["ls", PROJECT, "--prod", "--scope", SCOPE]);
  if (listed.status !== 0) {
    throw new Error(`Failed to list deployments:\n${listed.stderr || listed.stdout}`);
  }

  const text = `${listed.stdout}\n${listed.stderr}`;
  const readyMatch =
    text.match(
      /https:\/\/(mithron-flight-systems-[a-z0-9]+-kbkbkh\.vercel\.app)\s+●\s+Ready\s+Production/i
    ) ??
    text.match(/(mithron-flight-systems-[a-z0-9]+-kbkbkh\.vercel\.app)\s+●\s+Ready/i);

  if (readyMatch) return readyMatch[1];

  const building = /●\s+Building\s+Production/i.test(text) || /●\s+Initializing\s+Production/i.test(text);
  if (building) return null;

  const any = text.match(/mithron-flight-systems-[a-z0-9]+-kbkbkh\.vercel\.app/);
  if (!any) {
    throw new Error(`Could not find a production deployment URL in:\n${text}`);
  }
  return any[0];
}

async function waitForReadyDeployment() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const host = latestProductionDeploymentUrl();
    if (host) return host;
    console.log(`Waiting for Ready production deploy (${attempt}/${MAX_ATTEMPTS})...`);
    await delay(RETRY_MS);
  }
  throw new Error(`Timed out waiting for a Ready production deployment after ${MAX_ATTEMPTS} attempts`);
}

function promoteAlias(deploymentHost, aliasHost) {
  const deployment = deploymentHost.replace(/^https?:\/\//, "");
  console.log(`Promoting https://${aliasHost} → https://${deployment}`);
  const aliased = run(["alias", "set", deployment, aliasHost, "--scope", SCOPE]);
  const message = `${aliased.stdout}${aliased.stderr}`.trim();
  if (aliased.status !== 0) {
    throw new Error(`Failed to promote ${aliasHost}:\n${message}`);
  }
  console.log(message || `Success! https://${aliasHost} → https://${deployment}`);
}

async function main() {
  if (!process.env.VERCEL_TOKEN) {
    console.warn("VERCEL_TOKEN unset — relying on local Vercel CLI login.");
  }

  const deploymentHost = await waitForReadyDeployment();
  const failures = [];

  for (const aliasHost of PRODUCTION_ALIASES) {
    try {
      promoteAlias(deploymentHost, aliasHost);
    } catch (error) {
      failures.push({ aliasHost, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (failures.length) {
    console.error("Some aliases failed to promote:");
    for (const failure of failures) {
      console.error(`- ${failure.aliasHost}: ${failure.error}`);
    }
    process.exit(1);
  }

  console.log(`All ${PRODUCTION_ALIASES.length} production aliases now point to https://${deploymentHost}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
