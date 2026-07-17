type DebugPayload = Record<string, unknown>;

export function isSupplierProductFormDebugEnabled(searchParams?: URLSearchParams | null) {
  if (process.env.NODE_ENV !== "production" && searchParams?.get("product_debug") === "1") return true;
  return process.env.SUPPLIER_PRODUCT_FORM_DEBUG === "1";
}

export function logSupplierProductFormDebug(stage: string, payload: DebugPayload) {
  if (process.env.SUPPLIER_PRODUCT_FORM_DEBUG !== "1" && process.env.NODE_ENV === "production") {
    return;
  }
  console.info(`[supplier-product-form] ${stage}`, payload);
}
