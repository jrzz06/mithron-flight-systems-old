import { assertSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { AdminSuppliersLiveSync } from "@/components/admin/admin-suppliers-live-sync";
import {
  AdminSupplierProductsQueue,
  type PendingProduct,
  type PendingProductGalleryItem
} from "@/components/admin/admin-supplier-products-queue";
import { resolveNextImageSrc } from "@/lib/media/next-image-src";
import { readMediaSrc } from "@/lib/product-gallery";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { getCachedPendingSupplierProductCount } from "@/services/supplier-actions";
import { getDefaultWarehouseCode } from "@/services/warehouse-config";

function readGalleryItems(gallery: unknown): PendingProductGalleryItem[] {
  if (!Array.isArray(gallery)) return [];
  const items: PendingProductGalleryItem[] = [];
  const seen = new Set<string>();

  for (const item of gallery) {
    const src = readMediaSrc(item);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const alt = item && typeof item === "object" && !Array.isArray(item)
      ? String((item as Record<string, unknown>).alt ?? "").trim()
      : "";
    items.push({ src, ...(alt ? { alt } : {}) });
  }

  return items;
}

async function fetchPendingProducts(supplierId?: string): Promise<PendingProduct[]> {
  const config = assertSupabaseAdminConfig(process.env);
  const supplierFilter = supplierId ? `&supplier_id=eq.${encodeURIComponent(supplierId)}` : "";
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/mithron_products?select=slug,name,category,price,supplier_id,workflow_status,updated_at,description,image,hero,gallery&workflow_status=eq.pending_review${supplierFilter}&order=updated_at.desc&limit=100`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      cache: "no-store"
    }
  );
  if (!response.ok) return [];

  const products = (await response.json()) as Array<Record<string, unknown>>;
  const supplierIds = [...new Set(products.map((product) => String(product.supplier_id ?? "")).filter(Boolean))];
  const profileById = new Map<string, string>();

  if (supplierIds.length) {
    const profilesResponse = await fetchWithTimeout(
      `${config.url}/rest/v1/profiles?select=id,email,display_name&id=in.(${supplierIds.map(encodeURIComponent).join(",")})`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`
        },
        cache: "no-store"
      }
    );
    if (profilesResponse.ok) {
      const profiles = (await profilesResponse.json()) as Array<{ id?: string; email?: string; display_name?: string }>;
      for (const profile of profiles) {
        const id = String(profile.id ?? "");
        if (!id) continue;
        profileById.set(id, profile.display_name || profile.email || id);
      }
    }
  }

  return products.map((product) => {
    const supplierIdValue = product.supplier_id ? String(product.supplier_id) : null;
    const primarySrc = readMediaSrc(product.image) || readMediaSrc(product.hero);
    const galleryItems = readGalleryItems(product.gallery);
    const galleryWithoutPrimary = galleryItems.filter((item) => item.src !== primarySrc);
    const description = typeof product.description === "string" && product.description.trim()
      ? product.description.trim()
      : null;

    return {
      slug: String(product.slug),
      name: String(product.name),
      category: String(product.category),
      price: Number(product.price ?? 0),
      supplier_id: supplierIdValue,
      supplier_label: supplierIdValue ? profileById.get(supplierIdValue) ?? "Unknown supplier" : "Unknown supplier",
      workflow_status: String(product.workflow_status ?? "pending_review"),
      updated_at: String(product.updated_at ?? ""),
      description,
      thumbnailSrc: resolveNextImageSrc(primarySrc || null),
      galleryItems: galleryWithoutPrimary
    };
  });
}

export default async function AdminSupplierProductsPage({
  searchParams
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  const params = await searchParams;
  const supplierFilter = typeof params.supplier === "string" ? params.supplier.trim() : "";
  const [products, policy, defaultWarehouseCode, pendingCountUncached] = await Promise.all([
    fetchPendingProducts(supplierFilter || undefined),
    getAdminSettingsPolicy(),
    getDefaultWarehouseCode(),
    supplierFilter ? Promise.resolve(null as number | null) : getCachedPendingSupplierProductCount()
  ]);
  const pendingCount = supplierFilter ? products.length : (pendingCountUncached ?? 0);

  return (
    <div className="grid gap-5">
      <AdminSuppliersLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <div className="max-w-3xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">Supplier approvals</p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--platform-text-muted)]">
          Review supplier product submissions before they are published to the storefront.
        </p>
      </div>

      <AdminSupplierProductsQueue
        products={products}
        pendingCount={pendingCount}
        defaultWarehouseCode={defaultWarehouseCode}
        supplierFilter={supplierFilter || undefined}
      />
    </div>
  );
}
