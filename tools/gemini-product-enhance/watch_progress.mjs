#!/usr/bin/env node
/** Live progress for full catalog batch */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(ROOT, "manifest.json");
const LOG = path.join(ROOT, "run-log.jsonl");
const STAGING = path.join(ROOT, "staging");
const LIVE = path.join(ROOT, "run-full-catalog.log");

const total = JSON.parse(fs.readFileSync(MANIFEST, "utf8")).imageCount || 195;

function countWebp() {
  if (!fs.existsSync(STAGING)) return 0;
  let n = 0;
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.webp$/i.test(name) && !name.includes(".preview.")) n += 1;
    }
  };
  walk(STAGING);
  return n;
}

function lastEvents(n = 5) {
  if (!fs.existsSync(LOG)) return [];
  const lines = fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-n).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return { raw: l };
    }
  });
}

function tailLive(chars = 400) {
  if (!fs.existsSync(LIVE)) return "";
  const t = fs.readFileSync(LIVE, "utf8");
  return t.slice(-chars).replace(/\r/g, "");
}

const started = Date.now();
console.log(`LIVE catalog progress — total ${total} images\n`);

setInterval(() => {
  const done = countWebp();
  const ev = lastEvents(8);
  const oks = ev.filter((e) => e.event === "ok").length;
  const fails = fs.existsSync(LOG)
    ? fs.readFileSync(LOG, "utf8").split("\n").filter((l) => l.includes('"event":"fail"')).length
    : 0;
  const okTotal = fs.existsSync(LOG)
    ? fs.readFileSync(LOG, "utf8").split("\n").filter((l) => l.includes('"event":"ok"')).length
    : 0;
  const pct = ((done / total) * 100).toFixed(1);
  const elapsed = ((Date.now() - started) / 60000).toFixed(1);
  const last = ev[ev.length - 1];
  const lastMsg = last
    ? `${last.event || "?"} ${last.id || ""} ${last.error ? String(last.error).slice(0, 60) : ""}`.trim()
    : "(starting...)";
  const barLen = 30;
  const filled = Math.round((done / total) * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  console.clear();
  console.log("══════════════════════════════════════════");
  console.log("  FULL CATALOG — Gemini → BRIA → WebP");
  console.log("══════════════════════════════════════════");
  console.log(`  [${bar}] ${pct}%`);
  console.log(`  Done: ${done} / ${total}   OK:${okTotal}  FAIL:${fails}`);
  console.log(`  Elapsed: ${elapsed} min`);
  console.log(`  Last: ${lastMsg}`);
  console.log("──────────────────────────────────────────");
  console.log(tailLive(500));
  console.log("══════════════════════════════════════════");
}, 3000);
