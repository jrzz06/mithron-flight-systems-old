export function slugifyProductValue(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function resolveProductSlug(name: string, slugInput = "") {
  const fromInput = slugifyProductValue(slugInput);
  if (fromInput) return fromInput;

  const fromName = slugifyProductValue(name);
  if (fromName) return fromName;

  return `product-${Date.now().toString(36)}`;
}

export function parseProductPrice(value: FormDataEntryValue | null) {
  if (value == null) return Number.NaN;
  const normalized = String(value).replace(/[$,₹\s]/g, "").trim();
  if (!normalized) return Number.NaN;
  const price = Number(normalized);
  return Number.isFinite(price) ? price : Number.NaN;
}

export function parseSupplierProductForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "Agri Drones").trim() || "Agri Drones";
  const slugInput = String(formData.get("slug") ?? "").trim();
  const price = parseProductPrice(formData.get("price"));

  if (!name) {
    throw new Error("Product name is required.");
  }

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Enter a valid price in INR greater than 0.");
  }

  const slug = resolveProductSlug(name, slugInput);
  return { name, category, price, slug };
}
