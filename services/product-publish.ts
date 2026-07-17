import { fetchAdminRecordsByColumn, updateAdminRecord } from "@/services/admin-actions";

type JsonRecord = Record<string, unknown>;

export async function assertProductCanPublish(slug: string, options?: { requireSupplier?: boolean }) {
  const rows = await fetchAdminRecordsByColumn("mithron_products", "slug", slug);
  const product = rows[0] as JsonRecord | undefined;
  if (!product) {
    throw new Error(`Product ${slug} was not found.`);
  }

  const supplierId = String(product.supplier_id ?? "").trim();
  const submissionStatus = String(product.workflow_status ?? "");
  const isSupplierSubmission = submissionStatus === "pending_review" || Boolean(supplierId);

  if (options?.requireSupplier !== false && isSupplierSubmission && !supplierId) {
    throw new Error(`Product ${slug} cannot publish without a supplier_id.`);
  }

  return product;
}

/** Single publish path: validate product readiness. Inventory rows are created by the product insert trigger. */
export async function publishProductToStorefront(slug: string, actorId: string | null) {
  void actorId;
  return assertProductCanPublish(slug);
}

export async function markProductPublished(
  slug: string,
  actorId: string | null,
  extraFields: JsonRecord = {}
) {
  await publishProductToStorefront(slug, actorId);
  const now = new Date().toISOString();
  return updateAdminRecord(
    "mithron_products",
    "slug",
    slug,
    {
      workflow_status: "published",
      is_visible: true,
      published_at: now,
      updated_at: now,
      ...extraFields
    },
    actorId
  );
}
