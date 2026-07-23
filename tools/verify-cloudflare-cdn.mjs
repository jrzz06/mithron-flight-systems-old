#!/usr/bin/env node
/**
 * Verify Cloudflare CDN + Supabase Storage delivery setup.
 * Run: node tools/verify-cloudflare-cdn.mjs
 */
import { execSync } from "node:child_process";

const SUPABASE_ORIGIN = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ictnoydmxlywwxwnugal.supabase.co").replace(/\/$/, "");
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://final-mithron-deploy.vercel.app").replace(/\/$/, "");
const MEDIA_CDN = (process.env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN ?? "").replace(/\/$/, "");
const SAMPLE_STORAGE_PATH =
  "/storage/v1/object/public/mithron-products/catalog-cutouts/v1/10-liter-dual-agri-drone-08a006fb76ce.webp";

const checks = [];

function pass(label, detail) {
  checks.push({ ok: true, label, detail });
}

function fail(label, detail) {
  checks.push({ ok: false, label, detail });
}

function rewriteStorageUrlForCdn(src) {
  const trimmed = src?.trim() ?? "";
  const cdnOrigin = MEDIA_CDN || (process.env.NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL === "1" ? `${SITE_URL}/cdn-media` : "");
  if (!cdnOrigin || !trimmed.startsWith(SUPABASE_ORIGIN)) return trimmed;
  if (!trimmed.includes("/storage/v1/object/public/")) return trimmed;
  return `${cdnOrigin}${trimmed.slice(SUPABASE_ORIGIN.length)}`;
}

function dnsLookup(host) {
  try {
    const out = execSync(`nslookup ${host}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (/Non-existent domain|can't find|NXDOMAIN/i.test(out)) return { ok: false, text: out };
    return { ok: true, text: out };
  } catch (error) {
    const text = error.stdout?.toString?.() ?? error.message ?? String(error);
    if (/Non-existent domain|can't find|NXDOMAIN/i.test(text)) return { ok: false, text };
    return { ok: true, text };
  }
}

function detectProvider(dnsText) {
  if (/wixdns|wix\.com/i.test(dnsText)) return "Wix";
  if (/vercel|vercel-dns|cname\.vercel/i.test(dnsText)) return "Vercel";
  if (/cloudflare|cdn\.cloudflare/i.test(dnsText)) return "Cloudflare";
  return "unknown";
}

async function headOk(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return {
      ok: res.ok,
      status: res.status,
      cfCache: res.headers.get("cf-cache-status"),
      server: res.headers.get("server")
    };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

const sampleSupabase = `${SUPABASE_ORIGIN}${SAMPLE_STORAGE_PATH}`;
const rewritten = rewriteStorageUrlForCdn(sampleSupabase);
const viaVercelCdn = `${SITE_URL}/cdn-media${SAMPLE_STORAGE_PATH}`;
const viaMediaHost = MEDIA_CDN ? `${MEDIA_CDN}${SAMPLE_STORAGE_PATH}` : null;

if (MEDIA_CDN) {
  pass("NEXT_PUBLIC_MEDIA_CDN_ORIGIN", MEDIA_CDN);
} else if (process.env.NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL === "1") {
  pass("Media CDN mode", "Vercel /cdn-media proxy");
} else {
  pass("Media CDN mode", "Vercel /cdn-media (default on Vercel deploys)");
}

pass("URL rewrite sample", `${rewritten.slice(0, 100)}…`);

for (const host of ["www.mithron.co", "mithron.co", "media.mithron.co"]) {
  const { ok: dnsOk, text: dns } = dnsLookup(host);
  if (!dnsOk) {
    fail(`DNS ${host}`, "record missing — add in Cloudflare");
    continue;
  }
  const provider = detectProvider(dns);
  const ready = provider !== "Wix";
  (ready ? pass : fail)(`DNS ${host}`, provider);
}

const probes = [
  ["Supabase origin", sampleSupabase],
  ["Vercel /cdn-media", viaVercelCdn],
  ...(viaMediaHost ? [["Cloudflare media host", viaMediaHost]] : [])
];

for (const [label, url] of probes) {
  const result = await headOk(url);
  if (result.ok) {
    pass(`HTTP ${label}`, `${result.status} cf-cache=${result.cfCache ?? "n/a"}`);
  } else {
    fail(`HTTP ${label}`, result.error ?? `HTTP ${result.status}`);
  }
}

console.log("\nCloudflare CDN verification\n");
for (const check of checks) {
  console.log(`${check.ok ? "✓" : "✗"} ${check.label}`);
  console.log(`  ${check.detail}\n`);
}

const failed = checks.filter((c) => !c.ok).length;
if (failed) {
  console.log(`${failed} check(s) need attention.\n`);
  console.log("Cloudflare DNS (Proxied = orange cloud):");
  console.log("  CNAME  www    → cname.vercel-dns.com");
  console.log("  CNAME  media  → ictnoydmxlywwxwnugal.supabase.co");
  console.log("\nAfter DNS propagates, set Vercel env + redeploy:");
  console.log("  NEXT_PUBLIC_SITE_URL=https://www.mithron.co");
  console.log("  NEXT_PUBLIC_MEDIA_CDN_ORIGIN=https://media.mithron.co");
  process.exit(1);
}

console.log("All checks passed.");
process.exit(0);
