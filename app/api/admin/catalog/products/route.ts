import { NextResponse } from "next/server";
import { getSupabaseAdminConfig } from "@/lib/env";
import { buildSlugInFilter, publishedCatalogFilter } from "@/lib/catalog/filters";
import { requirePermission } from "@/services/auth";

type ProductRow = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function imageSrc(row: ProductRow) {
  const image = row.image;
  if (image && typeof image === "object" && !Array.isArray(image)) {
    const src = (image as Record<string, unknown>).src;
    if (typeof src === "string" && src.trim()) return src.trim();
  }
  const hero = row.hero;
  if (hero && typeof hero === "object" && !Array.isArray(hero)) {
    const src = (hero as Record<string, unknown>).src;
    if (typeof src === "string" && src.trim()) return src.trim();
  }
  return "";
}

function buildCatalogSearchFilter(query: string) {
  const pattern = encodeURIComponent(`*${query}*`);
  return `or=(name.ilike.${pattern},slug.ilike.${pattern},category.ilike.${pattern},tagline.ilike.${pattern},badge.ilike.${pattern})`;
}

function buildCategoryFilter(category: string) {
  return `category=ilike.${encodeURIComponent(`*${category}*`)}`;
}

function buildBrandFilter(brand: string) {
  return `badge=ilike.${encodeURIComponent(`*${brand}*`)}`;
}

function mapRow(row: ProductRow) {
  const variants = Array.isArray(row.variants) ? row.variants : [];
  const firstVariant = variants[0] && typeof variants[0] === "object" ? (variants[0] as Record<string, unknown>) : {};
  return {
    slug: text(row.slug),
    name: text(row.name),
    tagline: text(row.tagline),
    sku: text(firstVariant.sku) || text(row.slug),
    category: text(row.category),
    brand: text(row.badge) || "Mithron",
    price: Number(row.price) || 0,
    stock: Number(firstVariant.stock ?? row.stock) || 0,
    imageSrc: imageSrc(row),
    available: row.is_visible !== false && text(row.workflow_status) === "published"
  };
}

async function fetchProductRows(query: string) {
  const config = getSupabaseAdminConfig();
  if (!config.configured) return [] as ProductRow[];

  const response = await fetch(`${config.url}/rest/v1/mithron_products?${query}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`
    },
    cache: "no-store"
  });

  if (!response.ok) return [] as ProductRow[];
  return (await response.json()) as ProductRow[];
}

export async function GET(request: Request) {
  try {
    await requirePermission("cms.write");
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const category = url.searchParams.get("category")?.trim().toLowerCase() ?? "";
  const brand = url.searchParams.get("brand")?.trim().toLowerCase() ?? "";
  const sku = url.searchParams.get("sku")?.trim().toLowerCase() ?? "";
  const slugsParam = url.searchParams.get("slugs")?.trim() ?? "";
  const slugList = slugsParam
    ? slugsParam.split(",").map((slug) => slug.trim()).filter(Boolean)
    : [];
  const limit = Math.min(120, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
  const includeDrafts = url.searchParams.get("includeDrafts") === "true";

  const config = getSupabaseAdminConfig();
  if (!config.configured) {
    return NextResponse.json({ products: [] });
  }

  try {
    if (slugList.length) {
      const slugFilter = buildSlugInFilter(slugList);
      if (!slugFilter) return NextResponse.json({ products: [] });

      const statusFilter = includeDrafts ? "" : `&${publishedCatalogFilter}`;
      const rows = await fetchProductRows(
        `select=slug,name,category,price,image,hero,workflow_status,is_visible,tagline,variants,stock&${slugFilter}${statusFilter}`
      );
      const order = new Map(slugList.map((slug, index) => [slug, index]));
      rows.sort((a, b) => (order.get(text(a.slug)) ?? 0) - (order.get(text(b.slug)) ?? 0));
      return NextResponse.json({ products: rows.map(mapRow) });
    }

    const statusFilter = includeDrafts ? "" : `&${publishedCatalogFilter}`;
    const filters: string[] = [];
    if (query) filters.push(buildCatalogSearchFilter(query));
    if (category) filters.push(buildCategoryFilter(category));
    if (brand) filters.push(buildBrandFilter(brand));
    const filterQuery = filters.length ? `&${filters.join("&")}` : "";

    let rows = await fetchProductRows(
      `select=slug,name,category,price,image,hero,workflow_status,is_visible,tagline,variants,stock,badge&order=sort_order.asc&limit=${limit}${statusFilter}${filterQuery}`
    );

    if (sku) {
      rows = rows.filter((row) => {
        const variants = Array.isArray(row.variants) ? row.variants : [];
        const firstVariant = variants[0] && typeof variants[0] === "object" ? (variants[0] as Record<string, unknown>) : {};
        const rowSku = text(firstVariant.sku) || text(row.slug);
        return rowSku.toLowerCase().includes(sku);
      });
    }

    return NextResponse.json({ products: rows.map(mapRow) });
  } catch {
    return NextResponse.json({ error: "Catalog search failed." }, { status: 500 });
  }
}
