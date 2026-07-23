/**
 * Quick post-cleanup acceptance checks for Wix-only product imagery.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
      const name = trimmed.slice(0, eq);
      if (!name || process.env[name]) continue;
      process.env[name] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  loadEnv();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const media = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("media_assets")
      .select("id,storage_path,public_url")
      .eq("bucket", "mithron-products")
      .range(from, from + 499);
    if (error) throw error;
    media.push(...(data ?? []));
    if (!data || data.length < 500) break;
    from += 500;
  }

  const { data: products, error: pErr } = await sb.from("mithron_products").select("slug,image,hero,gallery");
  if (pErr) throw pErr;

  let jsonCutout = 0;
  let jsonAi = 0;
  let jsonWixstatic = 0;
  let jsonWixContent = 0;
  for (const p of products ?? []) {
    const srcs = [
      p.image?.src,
      p.hero?.src,
      ...(Array.isArray(p.gallery) ? p.gallery.map((g) => g?.src) : [])
    ].filter(Boolean);
    for (const s of srcs) {
      const str = String(s);
      if (str.includes("catalog-cutouts")) jsonCutout += 1;
      if (str.includes("/ai-cutout/") || str.includes("/ai-hero/")) jsonAi += 1;
      if (str.includes("wixstatic.com")) jsonWixstatic += 1;
      if (str.includes("/wix-content/")) jsonWixContent += 1;
    }
  }

  const cutouts = media.filter(
    (m) => (m.storage_path || "").includes("catalog-cutouts") || (m.public_url || "").includes("catalog-cutouts")
  );
  const ai = media.filter(
    (m) => (m.storage_path || "").includes("/ai-cutout/") || (m.storage_path || "").includes("/ai-hero/")
  );
  const wix = media.filter((m) => (m.storage_path || "").includes("/wix-content/"));

  console.log(
    JSON.stringify(
      {
        media_total: media.length,
        catalog_cutout_assets: cutouts.length,
        ai_assets_remaining: ai.length,
        wix_content_assets: wix.length,
        products: (products ?? []).length,
        product_json_cutout_refs: jsonCutout,
        product_json_ai_refs: jsonAi,
        product_json_wixstatic_refs: jsonWixstatic,
        product_json_wix_content_refs: jsonWixContent
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
