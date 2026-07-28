import { TimedActionForm } from "@/components/admin/timed-action-form";
import type { JSONContent } from "@tiptap/core";
import { StatusPill } from "@/components/platform";
import { SupplierEditProductForm } from "@/components/supplier/supplier-edit-product-form";
import { SupplierLiveSync } from "@/components/supplier/supplier-live-sync";
import { SupplierSubmitProductButton } from "@/components/supplier/supplier-submit-product-button";
import { supplierRejectionLabel, supplierStatusExplanation, supplierStatusHint } from "@/lib/platform/copy";
import { readProductImageSrc } from "@/lib/supplier/product-image";
import { readMediaSrc, readProductGalleryFromRow } from "@/lib/product-gallery";
import { getCurrentAuthContext } from "@/services/auth";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { getProductCategoryOptions } from "@/services/category-options";
import { getSupplierOwnedProduct } from "@/services/supplier-actions";
import { submitSupplierProductFormAction, updateSupplierProductFormStateAction } from "../../actions";
import { notFound } from "next/navigation";

export default async function SupplierEditProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [context, policy] = await Promise.all([getCurrentAuthContext(), getAdminSettingsPolicy()]);
  if (!context.userId) notFound();

  const [product, categoryOptions] = await Promise.all([
    getSupplierOwnedProduct(context.userId, slug),
    getProductCategoryOptions()
  ]);
  if (!product) notFound();

  const workflowStatus = product.workflowStatus ?? "draft";
  const rejectionReason = product.rejectionReason ?? null;
  const canEdit = ["draft", "rejected"].includes(workflowStatus);
  const canSubmit = ["draft", "rejected"].includes(workflowStatus);
  const statusHint = supplierStatusHint(workflowStatus);

  const imageSrc = product.imageSrc || readProductImageSrc(product.hero);
  const primarySrc = imageSrc;
  const galleryUrls = product.galleryUrls && product.galleryUrls.length
    ? product.galleryUrls.filter((src) => src && src !== primarySrc)
    : readProductGalleryFromRow(product as Record<string, unknown>)
        .map((item) => readMediaSrc(item))
        .filter((src) => src && src !== primarySrc);

  const description = product.description ?? "";
  const descriptionJson = (product.descriptionJson ?? (product as unknown as Record<string, unknown>).description_json) as JSONContent | string | null | undefined;

  return (
    <div className="max-w-xl grid gap-5">
      <SupplierLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={workflowStatus} />
        {statusHint ? <p className="text-sm text-[var(--platform-text-muted)]">{statusHint}</p> : null}
      </div>

      {workflowStatus === "rejected" && rejectionReason ? (
        <div className="rounded-[8px] border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-100">
          <p className="font-semibold">{supplierRejectionLabel()}</p>
          <p className="mt-1 text-rose-100/90">{rejectionReason}</p>
        </div>
      ) : null}

      {workflowStatus === "pending_review" ? (
        <p className="rounded-[8px] border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100">
          You cannot edit this product while it is being reviewed.
        </p>
      ) : null}

      {canEdit ? (
        <>
          <SupplierEditProductForm
            action={updateSupplierProductFormStateAction}
            categoryOptions={categoryOptions}
            defaults={{
              slug,
              name: product.name || "",
              category: product.category || "Agri Drones",
              price: product.price || 0,
              description,
              descriptionJson: descriptionJson ?? undefined,
              specs: product.specs ?? undefined,
              imageSrc,
              imageAlt: product.name || "",
              galleryUrls,
              updatedAt: product.updatedAt ?? null
            }}
          />
          {canSubmit ? (
            <TimedActionForm action={submitSupplierProductFormAction} actionLabel="Submit product for review" className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-5">
              <input type="hidden" name="slug" value={slug} />
              <p className="text-sm text-[var(--platform-text-muted)]">
                When you are ready, send this product to our team for review. It will not appear on the store until approved.
              </p>
              <SupplierSubmitProductButton variant="button" label="Send for review" />
            </TimedActionForm>
          ) : null}
        </>
      ) : (
        <p className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-5 text-sm text-[var(--platform-text-muted)]">
          {supplierStatusExplanation(workflowStatus)}
        </p>
      )}
    </div>
  );
}
