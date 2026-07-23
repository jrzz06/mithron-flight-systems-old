"use client";

import { ProductFieldLabel } from "@/components/admin/product-info-tooltip";
import { ProductBadgeFields } from "@/components/admin/product-badge-fields";
import { ProductPricingFields } from "@/components/admin/product-pricing-fields";
import { ProductSpecFields } from "@/components/admin/product-spec-fields";
import { ProductTaxFields } from "@/components/admin/product-tax-fields";
import { RichTextEditor } from "@/components/editor/RichTextEditor/lazy";
import { WarehouseCodeSelect } from "@/components/warehouse/warehouse-code-select";

type ProductCreateDetailFieldsProps = {
  warehouses?: Array<{ code: string; name: string }>;
  defaultWarehouseCode?: string;
};

export function ProductCreateDetailFields({
  warehouses = [],
  defaultWarehouseCode = ""
}: ProductCreateDetailFieldsProps) {
  return (
    <div data-product-create-detail-fields className="grid gap-4 lg:col-span-2">
      <section data-product-create-basic-info className="grid gap-4">
        <p className="type-meta font-semibold uppercase tracking-[0.12em] text-[var(--platform-text-muted)]">Basic info</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <ProductFieldLabel>Name</ProductFieldLabel>
            <input
              name="name"
              required
              placeholder="Agri Kisan Drone Medium - 10 Liter"
              className="h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
            />
          </label>
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <ProductFieldLabel>Tagline</ProductFieldLabel>
            <input
              name="tagline"
              placeholder="Short subtitle shown under the product name"
              className="h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
            />
          </label>
        </div>
        <ProductBadgeFields text="" style="default" />
        <label className="grid gap-1.5 text-sm">
          <ProductFieldLabel>Description</ProductFieldLabel>
          <input type="hidden" name="description_editor_present" value="1" />
          <RichTextEditor
            name="description"
            jsonName="description_json"
            placeholder="Describe features, payload, and warranty details..."
            documentType="product_description"
            documentId="create"
          />
        </label>
        <ProductSpecFields />
      </section>

      <ProductPricingFields initialPrice={0} variant="dark" />
      <ProductTaxFields variant="dark" />

      <details data-product-create-inventory className="rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4">
        <summary className="cursor-pointer text-sm font-medium text-[var(--platform-text-primary)]">Initial inventory (optional)</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {warehouses.length ? (
            <WarehouseCodeSelect
              name="inventory_warehouse_code"
              warehouses={warehouses}
              defaultValue={defaultWarehouseCode || warehouses[0]?.code || ""}
              required={false}
              label="Warehouse"
              className="text-sm text-[var(--platform-text-primary)]"
            />
          ) : (
            <label className="grid gap-1.5 text-sm sm:col-span-2">
              <ProductFieldLabel>Warehouse code</ProductFieldLabel>
              <input
                name="inventory_warehouse_code"
                placeholder="IN-WEST-01"
                className="h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface-muted)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
              />
            </label>
          )}
          <label className="grid gap-1.5 text-sm">
            <ProductFieldLabel>Initial quantity</ProductFieldLabel>
            <input
              name="inventory_initial_quantity"
              type="number"
              min={0}
              defaultValue={0}
              className="h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface-muted)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <ProductFieldLabel>Reorder threshold</ProductFieldLabel>
            <input
              name="inventory_reorder_threshold"
              type="number"
              min={0}
              defaultValue={0}
              className="h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface-muted)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
            />
          </label>
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <ProductFieldLabel>SKU</ProductFieldLabel>
            <input
              readOnly
              value="Derived automatically from product slug"
              className="h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface-muted)] px-3 text-sm text-[var(--platform-text-muted)] outline-none"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--platform-text-secondary)] sm:col-span-2">
            <input type="checkbox" name="inventory_track" value="on" defaultChecked className="h-4 w-4 rounded border-[var(--platform-border)]" />
            Track inventory for this product
          </label>
        </div>
      </details>
    </div>
  );
}
