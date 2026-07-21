import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [n, ...p] = t.split("=");
    if (!n || process.env[n]) continue;
    process.env[n] = p.join("=").replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const KEEP_PATH = "catalog-cutouts/v1/2408-sets-of-propeller-with-adaptor-715003fa8d85.webp";
const old = [
  {
    id: "catalog.cutout.v1.source-2408-sets-of-propeller-with-adaptor.0d2b7a38a918",
    path: "catalog-cutouts/v1/source-2408-sets-of-propeller-with-adaptor-0d2b7a38a918.webp"
  },
  {
    id: "catalog.cutout.v1.2408-sets-of-propeller-with-adaptor.3d73e5101faf",
    path: "catalog-cutouts/v1/2408-sets-of-propeller-with-adaptor-3d73e5101faf.webp"
  }
];

for (const o of old) {
  const { error: e1 } = await sb.storage.from("mithron-products").remove([o.path]);
  const { error: e2 } = await sb.from("media_assets").delete().eq("id", o.id);
  console.log(JSON.stringify({ path: o.path, storage: e1?.message || "ok", db: e2?.message || "ok" }));
}
console.log(JSON.stringify({ kept: KEEP_PATH }));
