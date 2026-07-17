import { SupplierNewProductForm } from "@/components/supplier/supplier-new-product-form";
import { SupplierLiveSync } from "@/components/supplier/supplier-live-sync";
import { createSupplierProductFormStateAction } from "../actions";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { getProductCategoryOptions } from "@/services/category-options";

export default async function SupplierNewProductPage() {
  const [policy, categoryOptions] = await Promise.all([
    getAdminSettingsPolicy(),
    getProductCategoryOptions()
  ]);

  return (
    <div className="max-w-xl grid gap-5">
      <SupplierLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <p className="text-sm leading-relaxed text-[var(--platform-text-secondary)]">
        Add a new product listing. Save as a draft to continue later, or save and send for review when you are ready
        for our team to approve it.
      </p>
      <SupplierNewProductForm
        action={createSupplierProductFormStateAction}
        categoryOptions={categoryOptions}
      />
    </div>
  );
}
