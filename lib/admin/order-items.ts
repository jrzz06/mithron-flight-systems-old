export type ConversionLineItem = {
  productSlug: string;
  quantity: number;
};

export type OrderItemPickerLine = {
  productSlug: string;
  productName: string;
  quantity: number;
  unitPrice?: number;
};

export function parseConversionLineItems(raw: string): ConversionLineItem[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const productSlug = String(record.productSlug ?? record.product_slug ?? "").trim();
        const quantity = Number(record.quantity ?? 1);
        if (!productSlug || !Number.isInteger(quantity) || quantity <= 0) return null;
        return { productSlug, quantity };
      })
      .filter((item): item is ConversionLineItem => Boolean(item));
  } catch {
    return [];
  }
}

export function readOrderItemsFromFormData(formData: FormData, fieldName = "order_items"): ConversionLineItem[] {
  return parseConversionLineItems(String(formData.get(fieldName) ?? ""));
}
