"use client";

import { useMemo } from "react";
import { useAdminLiveCollectionRows } from "@/components/admin/realtime/use-admin-live-collection-rows";
import type { AdminEntityRow } from "@/lib/admin/realtime/admin-entity-store";
import { ProductCatalogGrid, type ProductCatalogGridRow } from "@/app/admin/products/product-catalog-grid";
import type { ProductCategoryOption } from "@/app/admin/products/product-category-field";

type ProductSsrRow = AdminEntityRow & {
  slug?: string;
  workflow_status?: string;
  is_visible?: boolean;
  archived_at?: string | null;
  name?: string;
  updated_at?: string | null;
};

type AdminProductsLiveWorkspaceProps = {
  productRows: ProductCatalogGridRow[];
  products: ProductSsrRow[];
  totalCount: number;
  statusFilter: string;
  canForceDelete: boolean;
  categoryOptions: ProductCategoryOption[];
  deleteCategoryAction: (formData: FormData) => void | Promise<void>;
};

export function AdminProductsLiveWorkspace({
  productRows,
  products,
  totalCount,
  statusFilter,
  canForceDelete,
  categoryOptions,
  deleteCategoryAction
}: AdminProductsLiveWorkspaceProps) {
  const liveProducts = useAdminLiveCollectionRows(
    "products",
    "mithron_products",
    products,
    ["slug", "id"]
  ) as ProductSsrRow[];

  const liveProductRows = useMemo(() => {
    const bySlug = new Map(
      liveProducts.map((product) => [String(product.slug ?? product.id ?? ""), product])
    );

    return productRows.map((row) => {
      const live = bySlug.get(row.id);
      if (!live) return row;

      const workflow = String(live.workflow_status ?? row.status);
      const isArchived = workflow === "archived" || Boolean(live.archived_at);

      return {
        ...row,
        title: live.name ? String(live.name) : row.title,
        status: workflow,
        isVisible: isArchived ? false : Boolean(live.is_visible ?? row.isVisible),
        updatedAt: live.updated_at ? String(live.updated_at) : row.updatedAt
      };
    });
  }, [liveProducts, productRows]);

  return (
    <ProductCatalogGrid
      rows={liveProductRows}
      totalCount={totalCount}
      statusFilter={statusFilter}
      canForceDelete={canForceDelete}
      categoryOptions={categoryOptions}
      deleteCategoryAction={deleteCategoryAction}
    />
  );
}
