import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminSupabase = SupabaseClient<any, "public", "public">;
type PublishedProductRow = { slug: string | null };
type ProductMediaLinkRow = {
  product_slug: string;
  media_asset_id: string | null;
  usage: string | null;
  sort_order: number | null;
  is_primary: boolean | null;
  alt_text: string | null;
  caption: string | null;
  metadata: unknown;
};
import { upsertProductMediaAssetRecord } from "@/services/admin-actions";
import { ensureProductMediaLinksForProduct } from "@/lib/product-media-cleanup";
import { readProductGalleryFromRow } from "@/lib/product-gallery";

type ProductRow = {
  slug: string;
  name: string;
  image?: unknown;
  hero?: unknown;
  gallery?: unknown;
};

export async function syncAllProductMediaLinks() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const rows: ProductRow[] = [];
  const pageSize = 200;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("mithron_products")
      .select("slug,name,image,hero,gallery")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to read mithron_products: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as ProductRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  let linked = 0;
  for (const row of rows) {
    const result = await ensureProductMediaLinksForProduct({
      productSlug: row.slug,
      productName: row.name,
      media: {
        image: row.image,
        hero: row.hero,
        gallery: readProductGalleryFromRow(row)
      },
      actorId: null
    });
    linked += result.linked;
  }

  return {
    product_count: rows.length,
    links_created: linked,
    primary_promoted: await promoteMissingPrimaryLinks(supabase)
  };
}

async function promoteMissingPrimaryLinks(supabase: AdminSupabase) {
  const { data: published, error } = await supabase
    .from("mithron_products")
    .select("slug")
    .eq("workflow_status", "published")
    .eq("is_visible", true);

  if (error) throw new Error(`Failed to read published products: ${error.message}`);

  let promoted = 0;
  for (const row of (published ?? []) as PublishedProductRow[]) {
    const slug = String(row.slug ?? "");
    if (!slug) continue;

    const { data: links, error: linksError } = await supabase
      .from("product_media_assets")
      .select("product_slug,media_asset_id,usage,sort_order,is_primary,alt_text,caption,metadata")
      .eq("product_slug", slug)
      .order("sort_order", { ascending: true });

    if (linksError) throw new Error(`Failed to read links for ${slug}: ${linksError.message}`);
    const linkRows = (links ?? []) as ProductMediaLinkRow[];
    if (!linkRows.length) continue;
    if (linkRows.some((link) => link.usage === "primary" && link.is_primary)) continue;

    const candidate = linkRows[0];
    if (!candidate?.media_asset_id) continue;

    await upsertProductMediaAssetRecord(
      {
        product_slug: slug,
        media_asset_id: String(candidate.media_asset_id),
        usage: "primary",
        sort_order: Number(candidate.sort_order ?? 0),
        is_primary: true,
        alt_text: String(candidate.alt_text ?? slug),
        caption: String(candidate.caption ?? slug),
        metadata: candidate.metadata ?? { source: "primary-link-promotion" },
        updated_at: new Date().toISOString()
      },
      null,
      process.env,
      { allowSystemActor: true }
    );
    promoted += 1;
  }

  return promoted;
}
