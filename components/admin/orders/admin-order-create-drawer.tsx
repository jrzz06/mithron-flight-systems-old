"use client";

import { ManualOrderCreatePanel } from "@/components/admin/manual-order-create-panel";
import { AdminSlideOver } from "@/components/admin/admin-slide-over";

type CatalogProduct = {
  slug: string;
  name: string;
  price: number;
  chargeTax?: boolean | null;
  taxRate?: number | null;
  taxIncluded?: boolean | null;
  taxGroup?: string | null;
};

type AdminOrderCreateDrawerProps = {
  open: boolean;
  onClose: () => void;
  products: CatalogProduct[];
  defaultWarehouseCode: string;
  createAction: (formData: FormData) => Promise<void>;
};

export function AdminOrderCreateDrawer({
  open,
  onClose,
  products,
  defaultWarehouseCode,
  createAction
}: AdminOrderCreateDrawerProps) {
  return (
    <AdminSlideOver
      open={open}
      onClose={onClose}
      title="Create order"
      widthClass="w-full max-w-3xl"
      dataAttribute="data-admin-order-create-drawer"
    >
      <ManualOrderCreatePanel
        products={products}
        defaultWarehouseCode={defaultWarehouseCode}
        createAction={createAction}
      />
    </AdminSlideOver>
  );
}
