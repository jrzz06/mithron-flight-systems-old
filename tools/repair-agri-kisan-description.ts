/**
 * One-off repair: rebuild description (+ simple TipTap JSON) for
 * source-agri-kisan-drone-small-8-liter from source_description.
 *
 * Usage:
 *   node --experimental-strip-types tools/repair-agri-kisan-description.ts
 *   node --experimental-strip-types tools/repair-agri-kisan-description.ts --apply
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { normalizeProductDescriptionHtml } from "../lib/product-description-normalize.ts";

const SLUG = "source-agri-kisan-drone-small-8-liter";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadProjectEnv() {
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

function decodeBasicEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function textNode(text: string) {
  return { type: "text", text };
}

function boldTextNode(text: string) {
  return { type: "text", marks: [{ type: "bold" }], text };
}

/** Minimal TipTap doc from the normalizer's paragraph/list HTML. */
function htmlToSimpleEditorDocument(html: string) {
  const content: Array<Record<string, unknown>> = [];
  const chunks = html.match(/<p>[\s\S]*?<\/p>|<ul>[\s\S]*?<\/ul>/gi) ?? [];

  for (const chunk of chunks) {
    if (/^<ul>/i.test(chunk)) {
      const items = [...chunk.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((match) => decodeBasicEntities(match[1] ?? "").trim());
      if (!items.length) continue;
      content.push({
        type: "bulletList",
        content: items.map((item) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: [textNode(item)] }]
        }))
      });
      continue;
    }

    const inner = chunk.replace(/^<p>/i, "").replace(/<\/p>$/i, "");
    const strongMatch = inner.match(/^<strong>([\s\S]*?)<\/strong>\s*([\s\S]*)$/i);
    if (strongMatch) {
      const label = decodeBasicEntities(strongMatch[1] ?? "").trim();
      const rest = decodeBasicEntities(strongMatch[2] ?? "").trim();
      const nodes = [boldTextNode(label)];
      if (rest) nodes.push(textNode(` ${rest}`));
      content.push({ type: "paragraph", content: nodes });
      continue;
    }

    const plain = decodeBasicEntities(inner.replace(/<[^>]+>/g, "")).trim();
    if (plain) content.push({ type: "paragraph", content: [textNode(plain)] });
  }

  return {
    type: "doc",
    content: content.length ? content : [{ type: "paragraph" }]
  };
}

async function main() {
  loadProjectEnv();
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("mithron_products")
    .select("slug,source_description,description")
    .eq("slug", SLUG)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Product not found: ${SLUG}`);

  const source = String(data.source_description ?? "").trim();
  if (!source) throw new Error(`Empty source_description for ${SLUG}`);

  const html = normalizeProductDescriptionHtml(source);
  if (!html) throw new Error(`Normalizer returned empty HTML for ${SLUG}`);

  const descriptionJson = htmlToSimpleEditorDocument(html);
  console.log(JSON.stringify({
    slug: SLUG,
    apply,
    notes_count: (html.match(/Notes:/gi) ?? []).length,
    has_package_contents: /Package Contents:/i.test(html),
    has_orphan_16000: /<p>16000<\/p>/.test(html),
    html_preview: html.slice(0, 280)
  }, null, 2));

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write.");
    return;
  }

  const { error: updateError } = await supabase
    .from("mithron_products")
    .update({
      description: html,
      description_json: descriptionJson
    })
    .eq("slug", SLUG);

  if (updateError) throw new Error(updateError.message);
  console.log(`Updated ${SLUG}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
