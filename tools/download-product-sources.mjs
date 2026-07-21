#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2];
if (!slug) throw new Error("Usage: node tools/download-product-sources.mjs <slug>");

for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [n, ...p] = t.split("=");
    if (!n || process.env[n]) continue;
    process.env[n] = p.join("=").replace(/^["']|["']$/g, "");
  }
}

function readSrc(v) {
  if (!v) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v)?.src || v;
    } catch {
      return v;
    }
  }
  return v?.src || null;
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const { data, error } = await sb
  .from("mithron_products")
  .select("slug,name,gallery,source_images,image")
  .eq("slug", slug)
  .single();
if (error) throw error;

const outDir = join(root, "tools", ".cutout-pilot-test", slug, "sources");
mkdirSync(outDir, { recursive: true });

const items = [];
const add = async (field, url) => {
  if (!url || url.includes("/catalog-cutouts/")) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = extname(new URL(url).pathname) || ".webp";
  const name = `${field}${ext}`;
  const path = join(outDir, name);
  writeFileSync(path, buf);
  const meta = await sharp(buf, { failOn: "none" }).metadata();
  items.push({ field, url, path, width: meta.width, height: meta.height, bytes: buf.length });
};

for (let i = 0; i < (data.gallery ?? []).length; i++) {
  const url = readSrc(data.gallery[i]);
  await add(`gallery-${i}`, url);
}
for (let i = 0; i < (data.source_images ?? []).length; i++) {
  const url = readSrc(data.source_images[i]);
  await add(`source-${i}`, url);
}

console.log(JSON.stringify({ slug: data.slug, name: data.name, outDir, items }, null, 2));
