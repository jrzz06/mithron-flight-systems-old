/* eslint-disable @typescript-eslint/no-require-imports */
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");

const root = join(__dirname, "..");

function loadProjectEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(envPath)) continue;
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [name, ...parts] = trimmed.split("=");
      if (!name || process.env[name]) continue;
      process.env[name] = parts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

function installTypeScriptRuntime() {
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    if (request.startsWith("@/")) {
      return originalResolveFilename.call(this, join(root, request.slice(2)), parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  require.extensions[".ts"] = function compileTypeScript(module, filename) {
    const source = readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        resolveJsonModule: true,
        target: ts.ScriptTarget.ES2022
      },
      fileName: filename
    }).outputText;
    module._compile(output, filename);
  };
}

function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

function serializeMedia(media) {
  if (!media) return null;
  return {
    id: media.id ?? null,
    src: media.src,
    alt: media.alt,
    kind: media.kind ?? "image",
    width: media.width ?? null,
    height: media.height ?? null,
    poster: media.poster ?? null,
    local: media.local ?? null,
    priority: media.priority ?? null,
    responsiveAssetId: media.responsive?.assetId ?? null,
    responsiveStatus: media.responsive?.status ?? null
  };
}

function serializeStorySection(section) {
  return {
    id: section.id,
    kicker: section.kicker,
    title: section.title,
    body: section.body,
    stat: section.stat ?? null,
    align: section.align ?? null,
    media: serializeMedia(section.media)
  };
}

function serializeProduct(product, index) {
  return {
    slug: product.slug,
    name: product.name,
    tagline: product.tagline,
    price: product.price,
    compare_at: product.compareAt ?? null,
    badge: product.badge ?? null,
    category: product.category,
    interests: product.interests,
    image: serializeMedia(product.image),
    hero: serializeMedia(product.hero),
    gallery: product.gallery.map(serializeMedia),
    hotspots: product.hotspots ?? [],
    variants: product.variants,
    bundles: product.bundles,
    story: product.story.map(serializeStorySection),
    specs: product.specs,
    anchors: product.anchors,
    product_url: `/product/${product.slug}`,
    sort_order: index,
    updated_at: new Date().toISOString()
  };
}

async function main() {
  loadProjectEnv();
  installTypeScriptRuntime();

  const { products } = require(join(root, "config", "products.ts"));
  const rows = products.map(serializeProduct);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("mithron_products").upsert(rows, { onConflict: "slug" });

  if (error) {
    throw new Error(`mithron_products upsert failed: ${error.message}`);
  }

  console.log(JSON.stringify({ status: "VERIFIED", products: rows.length }, null, 2));
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
