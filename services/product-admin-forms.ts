import { readEditorDocumentFields } from "@/lib/editor/read-form-content";
import { readProductBadgeFieldsFromFormData } from "@/lib/product-badge";
import { maybeNormalizeProductDescription } from "@/lib/product-description-normalize";
import { normalizeProductDescriptionForSave } from "@/lib/product-description-ai-normalize";
import { prepareEditorHtmlForSave } from "@/lib/editor/prepare-html";
import { assertAllowedProductMediaUrl } from "@/lib/media/is-blocked-external-media-url";
import { resolveProductPricing, type ProductDiscountType } from "@/lib/product-pricing";
import { getProductTaxGroup, isProductTaxGroupId } from "@/lib/product-tax-groups";

type JsonRecord = Record<string, unknown>;

export const PRODUCT_MEDIA_FIELD_NAMES = ["image_src", "hero_src", "gallery_urls"] as const;

type ProductDraftFormInput = {
  table: "mithron_products";
  identity: {
    slug: string;
  };
  fields: {
    name: string;
    tagline: string;
    price: number;
    compare_at: number | null;
    badge: string | null;
    description: string | null;
    description_json?: Record<string, unknown> | null;
    on_sale: boolean;
    discount_type: ProductDiscountType | null;
    discount_value: number | null;
    cost_of_goods: number | null;
    show_price_per_unit: boolean;
    charge_tax: boolean;
    tax_group: string | null;
    tax_rate: number | null;
    tax_included: boolean;
    category: string;
    interests: string[];
    image: JsonRecord;
    hero: JsonRecord;
    gallery: JsonRecord[];
    hotspots: JsonRecord[];
    variants: JsonRecord[];
    bundles: JsonRecord[];
    story: JsonRecord[];
    specs: Record<string, string>;
    anchors: string[];
    product_url: string;
    source_url: string | null;
    source_catalog_id: string | null;
    source_description: string | null;
    source_images: JsonRecord[];
    source_availability: string | null;
    source_currency: string | null;
  };
  entityId: string;
  sortOrder?: number;
  changeSummary?: string;
};

type ProductQuickEditFormInput = {
  table: "mithron_products";
  identity: {
    slug: string;
  };
  fields: {
    name?: string;
    category?: string;
    price?: number;
    compare_at?: number | null;
    badge?: string | null;
    description?: string | null;
    description_json?: Record<string, unknown> | null;
    on_sale?: boolean;
    discount_type?: ProductDiscountType | null;
    discount_value?: number | null;
    cost_of_goods?: number | null;
    show_price_per_unit?: boolean;
    charge_tax?: boolean;
    tax_group?: string | null;
    tax_rate?: number | null;
    tax_included?: boolean;
    source_availability?: string;
    is_visible?: boolean;
    image?: Record<string, unknown>;
    hero?: Record<string, unknown>;
    gallery?: Record<string, unknown>[];
    specs?: Record<string, string>;
  };
  entityId: string;
  changeSummary?: string;
};

type ProductSeoFormInput = {
  table: "mithron_products";
  identity: {
    slug: string;
  };
  fields: {
    seo_title: string | null;
    seo_description: string | null;
    og_title: string | null;
    og_description: string | null;
    og_image: JsonRecord | null;
  };
  entityId: string;
  changeSummary?: string;
};

type ProductMediaLinkFormInput = {
  table: "product_media_assets";
  identity: {
    product_slug: string;
    media_asset_id: string;
    usage: string;
  };
  fields: {
    variant_id?: string;
    sort_order: number;
    is_primary: boolean;
    alt_text?: string;
    caption?: string;
    metadata?: JsonRecord;
  };
  entityId: string;
  changeSummary?: string;
};

type ProductVariantsWorkflowInput = {
  table: "mithron_products";
  identity: {
    slug: string;
  };
  fields: {
    variants: JsonRecord[];
  };
  entityId: string;
  changeSummary?: string;
};

type ProductPublishStateFormInput = {
  table: "mithron_products";
  identity: {
    slug: string;
  };
  fields: {
    workflow_status: "draft" | "published" | "archived";
    is_visible: boolean;
  };
  entityId: string;
  changeSummary?: string;
};

type ProductDeleteFormInput = {
  table: "mithron_products";
  identity: {
    slug: string;
  };
  fields: {
    confirm_slug: string;
    force_delete?: boolean;
  };
  entityId: string;
  changeSummary?: string;
};

type ProductCategoryMetadataFormInput = {
  table: "category_metadata";
  identity: {
    route_key: string;
  };
  fields: {
    title: string;
    subtitle: string;
    hero_image: string;
    showcase_image: JsonRecord | null;
    personality: string | null;
    featured_product_slugs: string[];
    ecosystem_payload: JsonRecord;
    is_visible: boolean;
    status: "draft" | "published" | "archived";
  };
  entityId: string;
  sortOrder?: number;
  changeSummary?: string;
};

function readRequiredString(formData: FormData, key: string, label: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} ${key} is required.`);
  }
  return value.trim();
}

function readOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalNumber(formData: FormData, key: string, label: string) {
  const value = readOptionalString(formData, key);
  if (value === undefined) return undefined;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return numberValue;
}

function readJsonObject(formData: FormData, key: string, label: string) {
  const value = readOptionalString(formData, key);
  if (!value) {
    throw new Error(`${label} ${key} is required.`);
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} ${key} must be a JSON object.`);
    }
    return parsed as JsonRecord;
  } catch (error) {
    if (error instanceof Error && /must be a JSON object/.test(error.message)) throw error;
    throw new Error(`${label} ${key} must be valid JSON.`);
  }
}

function validateProductMediaUrl(url: string, label: string) {
  assertAllowedProductMediaUrl(url, label);
}

function buildMediaObjectFromSimpleFields(
  formData: FormData,
  prefix: string,
  fallbackAlt: string,
  options: { priority?: boolean } = {}
) {
  const src = readOptionalString(formData, `${prefix}_src`);
  if (!src) return undefined;
  validateProductMediaUrl(src, `${prefix}_src`);
  return {
    src,
    alt: readOptionalString(formData, `${prefix}_alt`) ?? fallbackAlt,
    kind: readOptionalString(formData, `${prefix}_kind`) ?? "image",
    local: readOptionalBoolean(formData, `${prefix}_local`),
    ...(options.priority ? { priority: true } : {})
  } as JsonRecord;
}

function readMediaObject(formData: FormData, key: string, label: string, fallbackAlt: string, options: { priority?: boolean } = {}) {
  return buildMediaObjectFromSimpleFields(formData, key, fallbackAlt, options) ?? readJsonObject(formData, key, label);
}

function readOptionalMediaObject(formData: FormData, key: string, label: string, fallbackAlt: string, options: { priority?: boolean } = {}) {
  return buildMediaObjectFromSimpleFields(formData, key, fallbackAlt, options) ?? readOptionalJsonObject(formData, key, label);
}

function readMediaListFromSimpleFields(formData: FormData, key: string, fallbackAlt: string) {
  const urls = readOptionalStringList(formData, `${key}_urls`);
  if (!urls.length) return undefined;
  for (const url of urls) {
    validateProductMediaUrl(url, `${key}_urls`);
  }
  const alts = readOptionalStringList(formData, `${key}_alts`);
  return urls.map((src, index) => ({
    src,
    alt: alts[index] ?? fallbackAlt,
    kind: "image",
    local: false
  })) as JsonRecord[];
}

function readMediaArray(formData: FormData, key: string, label: string, fallbackAlt: string) {
  return readMediaListFromSimpleFields(formData, key, fallbackAlt) ?? readJsonArray(formData, key, label);
}

function readJsonArray(formData: FormData, key: string, label: string) {
  const value = readOptionalString(formData, key);
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`${label} ${key} must be a JSON array.`);
    }
    return parsed as JsonRecord[];
  } catch (error) {
    if (error instanceof Error && /must be a JSON array/.test(error.message)) throw error;
    throw new Error(`${label} ${key} must be valid JSON.`);
  }
}

function readOptionalStringList(formData: FormData, key: string) {
  const value = readOptionalString(formData, key);
  if (value === undefined) return [];
  return value
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readStringEntries(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => typeof value === "string" ? value.trim() : "")
    .filter((value) => value.length > 0);
}

function slugifyRowId(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function readStructuredVariantRows(formData: FormData) {
  const ids = readStringEntries(formData, "variant_id");
  const names = readStringEntries(formData, "variant_name");
  const tones = readStringEntries(formData, "variant_tone");
  const skus = readStringEntries(formData, "variant_sku");
  const prices = readStringEntries(formData, "variant_price");
  const imageSrcs = readStringEntries(formData, "variant_image_src");
  const rowCount = Math.max(ids.length, names.length, tones.length, skus.length, prices.length, imageSrcs.length);
  const rows: JsonRecord[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const name = names[index] ?? "";
    const tone = tones[index] ?? "";
    const sku = skus[index] ?? "";
    const imageSrc = imageSrcs[index] ?? "";
    const price = prices[index] ? Number(prices[index]) : undefined;
    if (!name && !tone && !sku && !imageSrc && price === undefined) continue;
    if (imageSrc) validateProductMediaUrl(imageSrc, "variant_image_src");

    rows.push({
      id: ids[index] || slugifyRowId(name || sku || `variant-${index + 1}`, `variant-${index + 1}`),
      name: name || sku || `Variant ${index + 1}`,
      tone: tone || "standard",
      ...(sku ? { sku } : {}),
      ...(price !== undefined && Number.isFinite(price) ? { price } : {}),
      ...(imageSrc ? { image: { src: imageSrc, alt: name || sku || `Variant ${index + 1}`, kind: "image" } } : {})
    });
  }

  return rows;
}

function readStructuredSpecs(formData: FormData) {
  // Pair by row position, not by filtered-array index: `spec_key`/`spec_value`
  // inputs render as a fixed grid of rows and many rows are left blank, so
  // filtering empties out of each array independently (as readStringEntries
  // does) before pairing would silently shift later rows out of alignment.
  const keys = formData.getAll("spec_key").map((value) => (typeof value === "string" ? value.trim() : ""));
  const values = formData.getAll("spec_value").map((value) => (typeof value === "string" ? value.trim() : ""));
  const rowCount = Math.max(keys.length, values.length);
  const specs: Record<string, string> = {};

  for (let index = 0; index < rowCount; index += 1) {
    const key = keys[index] ?? "";
    const value = values[index] ?? "";
    if (!key || !value) continue;
    specs[key] = value;
  }

  return specs;
}

function readOptionalJsonObject(formData: FormData, key: string, label: string) {
  const value = readOptionalString(formData, key);
  if (value === undefined) return undefined;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} ${key} must be a JSON object.`);
    }
    return parsed as JsonRecord;
  } catch (error) {
    if (error instanceof Error && /must be a JSON object/.test(error.message)) throw error;
    throw new Error(`${label} ${key} must be valid JSON.`);
  }
}

function readVariantArray(formData: FormData, key: string, label: string) {
  const values = readJsonArray(formData, key, label);
  return values.map((variant, index) => {
    if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
      throw new Error(`${label} ${key} item ${index + 1} must be a plain object.`);
    }

    const record = variant as JsonRecord;
    const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : "";
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "";
    const tone = typeof record.tone === "string" && record.tone.trim() ? record.tone.trim() : "";

    if (!id || !name || !tone) {
      throw new Error(`${label} ${key} item ${index + 1} must include id, name, and tone.`);
    }

    return {
      ...record,
      id,
      name,
      tone
    } as JsonRecord;
  });
}

function readOptionalBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes";
  }
  return false;
}

function readRequiredEnum<T extends string>(formData: FormData, key: string, label: string, allowed: readonly T[]): T {
  const value = readRequiredString(formData, key, label);
  if (!allowed.includes(value as T)) {
    throw new Error(`${label} ${key} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function assertSlugSafe(value: string, label: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`${label} slug must use lowercase letters, numbers, and hyphens only.`);
  }
  return value;
}

function assertCategoryRouteKey(value: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error("Category route_key must use lowercase letters, numbers, and hyphens only.");
  }
  return value;
}

function slugFromProductName(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error("Product name must contain letters or numbers to create a slug.");
  }

  return slug;
}

function slugFromCategoryTitle(title: string) {
  const routeKey = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!routeKey) {
    throw new Error("Category title must contain letters or numbers to create a route key.");
  }

  return routeKey;
}

type ProductCommerceFields = {
  description?: string | null;
  description_json?: Record<string, unknown> | null;
  badge?: string | null;
  badge_enabled?: boolean;
  badge_text?: string | null;
  badge_style?: string;
  price?: number;
  compare_at?: number | null;
  on_sale?: boolean;
  discount_type?: ProductDiscountType | null;
  discount_value?: number | null;
  cost_of_goods?: number | null;
  show_price_per_unit?: boolean;
  charge_tax?: boolean;
  tax_group?: string | null;
  tax_rate?: number | null;
  tax_included?: boolean;
};

function readProductCommerceFields(formData: FormData): ProductCommerceFields {
  const fields: ProductCommerceFields = {};
  const descriptionEditorPresent = readOptionalString(formData, "description_editor_present") === "1";
  if (descriptionEditorPresent) {
    const editorContent = readEditorDocumentFields(formData, "description_json", "description");
    if (editorContent) {
      fields.description = prepareEditorHtmlForSave(editorContent.html)
        || maybeNormalizeProductDescription(editorContent.html)
        || null;
      fields.description_json = editorContent.json as Record<string, unknown> | null;
    }
  } else {
    const description = readOptionalString(formData, "description");
    if (description !== undefined) fields.description = maybeNormalizeProductDescription(description);
  }

  const badgeFields = readProductBadgeFieldsFromFormData(formData);
  if (badgeFields) {
    fields.badge_enabled = badgeFields.badge_enabled;
    fields.badge_text = badgeFields.badge_text;
    fields.badge_style = badgeFields.badge_style;
    fields.badge = badgeFields.badge;
  }

  const listPrice = readOptionalNumber(formData, "list_price", "Product list price");
  const legacyPrice = readOptionalNumber(formData, "price", "Product price");
  const hasExplicitPricingForm = formData.has("list_price")
    || formData.has("on_sale")
    || formData.has("discount_value")
    || formData.has("discount_type")
    || formData.has("cost_of_goods");
  const onSale = formData.has("on_sale") ? readOptionalBoolean(formData, "on_sale") : false;
  const discountTypeRaw = readOptionalString(formData, "discount_type");
  const discountType: ProductDiscountType = discountTypeRaw === "percent" ? "percent" : "amount";
  const discountValue = readOptionalNumber(formData, "discount_value", "Product discount value") ?? 0;
  const costOfGoods = readOptionalNumber(formData, "cost_of_goods", "Product cost of goods") ?? 0;

  if (hasExplicitPricingForm) {
    const resolved = resolveProductPricing({
      listPrice: listPrice ?? legacyPrice ?? 0,
      onSale,
      discountType,
      discountValue,
      costOfGoods
    });
    fields.price = resolved.price;
    fields.compare_at = resolved.compareAt;
    fields.on_sale = resolved.onSale;
    fields.discount_type = resolved.discountType;
    fields.discount_value = resolved.discountValue;
    fields.cost_of_goods = resolved.costOfGoods;
  } else if (legacyPrice !== undefined) {
    fields.price = legacyPrice;
  } else if (costOfGoods > 0) {
    fields.cost_of_goods = costOfGoods;
  }

  if (formData.has("show_price_per_unit")) {
    fields.show_price_per_unit = readOptionalBoolean(formData, "show_price_per_unit");
  }

  if (formData.has("charge_tax")) {
    fields.charge_tax = readOptionalBoolean(formData, "charge_tax");
    if (fields.charge_tax) {
      const taxGroup = readOptionalString(formData, "tax_group");
      if (taxGroup !== undefined) {
        if (!isProductTaxGroupId(taxGroup)) {
          throw new Error("Product tax group must be a supported GST catalog group.");
        }
        fields.tax_group = taxGroup;
        fields.tax_rate = getProductTaxGroup(taxGroup).rate;
      } else {
        fields.tax_rate = readOptionalNumber(formData, "tax_rate", "Product tax rate") ?? null;
      }
      fields.tax_included = readOptionalBoolean(formData, "tax_included");
    } else {
      fields.tax_group = null;
      fields.tax_rate = null;
      fields.tax_included = false;
    }
  }

  return fields;
}

export async function applyProductDescriptionSaveNormalization<T extends { description?: string | null }>(
  fields: T,
  env: Record<string, string | undefined> = process.env
): Promise<T> {
  if (fields.description === undefined) return fields;
  return {
    ...fields,
    description: await normalizeProductDescriptionForSave(fields.description, env)
  };
}

function readProductCategory(formData: FormData) {
  const categoryMode = readOptionalString(formData, "category_mode");
  const newCategory = readOptionalString(formData, "new_category");
  if (categoryMode === "new" || newCategory) {
    if (!newCategory) {
      throw new Error("Product new_category is required when adding a new category.");
    }
    return newCategory;
  }
  return readRequiredString(formData, "category", "Product");
}

export function buildProductQuickEditFromFormData(formData: FormData): ProductQuickEditFormInput {
  const slug = assertSlugSafe(readRequiredString(formData, "product_slug", "Product quick edit"), "Product quick edit");
  const fields: ProductQuickEditFormInput["fields"] = {};
  const name = readOptionalString(formData, "name");
  const category = readOptionalString(formData, "category");
  const sourceAvailability = readOptionalString(formData, "source_availability");
  const visibility = readOptionalString(formData, "visibility");
  const changeSummary = readOptionalString(formData, "change_summary");
  const commerceFields = readProductCommerceFields(formData);

  if (name) fields.name = name;
  if (category) fields.category = category;
  Object.assign(fields, commerceFields);
  if (sourceAvailability) fields.source_availability = sourceAvailability;
  // Only touch `specs` when the structured "Key specs" editor was actually
  // rendered on the submitting form (marked by this hidden field) - other
  // quick-edit forms that don't include the editor must never wipe specs.
  if (readOptionalString(formData, "specs_editor_present") === "1") {
    fields.specs = readStructuredSpecs(formData);
  }
  if (visibility) {
    if (visibility !== "visible" && visibility !== "hidden") {
      throw new Error("Product quick edit visibility must be visible or hidden.");
    }
    fields.is_visible = visibility === "visible";
  }

  if (!Object.keys(fields).length) {
    throw new Error("Product quick edit requires at least one field to update.");
  }

  return {
    table: "mithron_products",
    identity: {
      slug
    },
    fields,
    entityId: slug,
    changeSummary: changeSummary ?? `Quick edit product ${slug}`
  };
}

export function buildProductCategoryMetadataFromFormData(formData: FormData): ProductCategoryMetadataFormInput {
  const title = readRequiredString(formData, "category_title", "Category");
  const routeKey = assertCategoryRouteKey(readOptionalString(formData, "route_key") ?? slugFromCategoryTitle(title));
  const sortOrder = readOptionalNumber(formData, "sort_order", "Category sort order");
  const changeSummary = readOptionalString(formData, "change_summary");
  const isVisibleValue = readOptionalString(formData, "is_visible");
  const statusValue = readOptionalString(formData, "status") ?? "published";
  if (statusValue !== "draft" && statusValue !== "published" && statusValue !== "archived") {
    throw new Error("Category status must be draft, published, or archived.");
  }

  return {
    table: "category_metadata",
    identity: {
      route_key: routeKey
    },
    fields: {
      title,
      subtitle: readOptionalString(formData, "subtitle") ?? `${title} catalog category.`,
      hero_image: readOptionalString(formData, "hero_image") ?? "/media/mithron/hero/mapping-flight.webp",
      showcase_image: readOptionalJsonObject(formData, "showcase_image", "Category") ?? null,
      personality: readOptionalString(formData, "personality") ?? null,
      featured_product_slugs: readOptionalStringList(formData, "featured_product_slugs"),
      ecosystem_payload: readOptionalJsonObject(formData, "ecosystem_payload", "Category") ?? {
        source: "admin-products",
        created_from: "direct-category-add"
      },
      is_visible: isVisibleValue === undefined ? true : readOptionalBoolean(formData, "is_visible"),
      status: statusValue
    },
    entityId: routeKey,
    sortOrder,
    changeSummary: changeSummary ?? `Add category ${title} from admin catalog`
  };
}

export function buildProductDraftFromFormData(formData: FormData): ProductDraftFormInput {
  const name = readRequiredString(formData, "name", "Product");
  const slug = assertSlugSafe(readOptionalString(formData, "slug") ?? slugFromProductName(name), "Product");
  const tagline = `${name} catalog product`;
  const category = readProductCategory(formData);
  const image = readMediaObject(formData, "image", "Product", name, { priority: true });
  const hero = readOptionalMediaObject(formData, "hero", "Product", name, { priority: true }) ?? image;
  const gallery = readMediaArray(formData, "gallery", "Product", name);
  const productUrl = readOptionalString(formData, "product_url") ?? `/product/${slug}`;
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "mithron_products",
    identity: {
      slug
    },
    fields: {
      name,
      tagline,
      ...(() => {
        const commerce = readProductCommerceFields(formData);
        const hasCommerce = commerce.price !== undefined
          || commerce.description !== undefined
          || commerce.badge_text !== undefined
          || commerce.on_sale !== undefined
          || commerce.charge_tax !== undefined;

        if (hasCommerce) {
          return {
            price: commerce.price ?? readOptionalNumber(formData, "price", "Product price") ?? 0,
            compare_at: commerce.compare_at ?? readOptionalNumber(formData, "compare_at", "Product compare_at") ?? null,
            badge_enabled: commerce.badge_enabled ?? false,
            badge_text: commerce.badge_text ?? null,
            badge_style: commerce.badge_style ?? "default",
            badge: commerce.badge ?? null,
            description: commerce.description ?? readOptionalString(formData, "description") ?? null,
            description_json: commerce.description_json ?? null,
            on_sale: commerce.on_sale ?? false,
            discount_type: commerce.discount_type ?? null,
            discount_value: commerce.discount_value ?? null,
            cost_of_goods: commerce.cost_of_goods ?? null,
            show_price_per_unit: commerce.show_price_per_unit ?? false,
            charge_tax: commerce.charge_tax ?? true,
            tax_group: commerce.tax_group ?? "products-default",
            tax_rate: commerce.tax_rate ?? getProductTaxGroup(commerce.tax_group ?? "products-default").rate,
            tax_included: commerce.tax_included ?? false
          };
        }

        return {
          price: readOptionalNumber(formData, "price", "Product price") ?? 0,
          compare_at: readOptionalNumber(formData, "compare_at", "Product compare_at") ?? null,
          badge_enabled: false,
          badge_text: null,
          badge_style: "default",
          badge: null,
          description: readOptionalString(formData, "description") ?? null,
          description_json: readEditorDocumentFields(formData, "description_json", "description")?.json as Record<string, unknown> | null ?? null,
          on_sale: false,
          discount_type: null,
          discount_value: null,
          cost_of_goods: null,
          show_price_per_unit: false,
          charge_tax: true,
          tax_group: "products-default",
          tax_rate: getProductTaxGroup("products-default").rate,
          tax_included: false
        };
      })(),
      category,
      interests: readOptionalStringList(formData, "interests"),
      image,
      hero,
      gallery: gallery.length ? gallery : [image],
      hotspots: readJsonArray(formData, "hotspots", "Product"),
      variants: readStructuredVariantRows(formData).length ? readStructuredVariantRows(formData) : readJsonArray(formData, "variants", "Product"),
      bundles: readJsonArray(formData, "bundles", "Product"),
      story: readJsonArray(formData, "story", "Product"),
      specs: Object.keys(readStructuredSpecs(formData)).length
        ? readStructuredSpecs(formData)
        : (readOptionalJsonObject(formData, "specs", "Product") ?? {}) as Record<string, string>,
      anchors: readOptionalStringList(formData, "anchors"),
      product_url: productUrl,
      source_url: readOptionalString(formData, "source_url") ?? null,
      source_catalog_id: readOptionalString(formData, "source_catalog_id") ?? null,
      source_description: readOptionalString(formData, "source_description") ?? null,
      source_images: readMediaArray(formData, "source_images", "Product", name),
      source_availability: readOptionalString(formData, "source_availability") ?? null,
      source_currency: readOptionalString(formData, "source_currency") ?? null
    },
    entityId: slug,
    sortOrder: readOptionalNumber(formData, "sort_order", "Product sort order"),
    changeSummary: changeSummary ?? `Draft product ${slug}`
  };
}

export function buildProductMediaLinkFromFormData(formData: FormData): ProductMediaLinkFormInput {
  const productSlug = readRequiredString(formData, "product_slug", "Product media");
  const mediaAssetId = readRequiredString(formData, "media_asset_id", "Product media");
  const usage = readOptionalString(formData, "usage") ?? "gallery";
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "product_media_assets",
    identity: {
      product_slug: productSlug,
      media_asset_id: mediaAssetId,
      usage
    },
    fields: {
      ...(readOptionalString(formData, "variant_id") ? { variant_id: readOptionalString(formData, "variant_id") } : {}),
      sort_order: readOptionalNumber(formData, "sort_order", "Product media sort order") ?? 0,
      is_primary: readOptionalBoolean(formData, "is_primary"),
      ...(readOptionalString(formData, "alt_text") ? { alt_text: readOptionalString(formData, "alt_text") } : {}),
      ...(readOptionalString(formData, "caption") ? { caption: readOptionalString(formData, "caption") } : {}),
      ...(readOptionalJsonObject(formData, "metadata", "Product media") ? { metadata: readOptionalJsonObject(formData, "metadata", "Product media") } : {})
    },
    entityId: `${productSlug}:${mediaAssetId}:${usage}`,
    changeSummary: changeSummary ?? `Link product media ${productSlug}`
  };
}

export function buildProductVariantsWorkflowFromFormData(formData: FormData): ProductVariantsWorkflowInput {
  const slug = readRequiredString(formData, "product_slug", "Product variants");
  const structuredVariants = readStructuredVariantRows(formData);
  const variants = structuredVariants.length ? structuredVariants : readVariantArray(formData, "variants", "Product variants");
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "mithron_products",
    identity: {
      slug
    },
    fields: {
      variants
    },
    entityId: slug,
    changeSummary: changeSummary ?? `Update product variants ${slug}`
  };
}

export function buildProductSeoDraftFromFormData(formData: FormData): ProductSeoFormInput {
  const slug = assertSlugSafe(readRequiredString(formData, "product_slug", "Product SEO"), "Product SEO");
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "mithron_products",
    identity: {
      slug
    },
    fields: {
      seo_title: readOptionalString(formData, "seo_title") ?? null,
      seo_description: readOptionalString(formData, "seo_description") ?? null,
      og_title: readOptionalString(formData, "og_title") ?? null,
      og_description: readOptionalString(formData, "og_description") ?? null,
      og_image: readOptionalMediaObject(formData, "og_image", "Product SEO", readOptionalString(formData, "seo_title") ?? slug) ?? null
    },
    entityId: slug,
    changeSummary: changeSummary ?? `Update product SEO ${slug}`
  };
}

export function buildProductPublishStateFromFormData(formData: FormData): ProductPublishStateFormInput {
  const slug = assertSlugSafe(readRequiredString(formData, "product_slug", "Product publish"), "Product publish");
  const workflowStatus = readRequiredEnum(formData, "workflow_status", "Product publish", ["draft", "published", "archived"] as const);
  const changeSummary = readOptionalString(formData, "change_summary");

  return {
    table: "mithron_products",
    identity: {
      slug
    },
    fields: {
      workflow_status: workflowStatus,
      is_visible: readOptionalBoolean(formData, "is_visible")
    },
    entityId: slug,
    changeSummary: changeSummary ?? `Set product ${slug} to ${workflowStatus}`
  };
}

function readProductDeleteConfirmation(formData: FormData) {
  const slug = assertSlugSafe(readRequiredString(formData, "product_slug", "Product delete"), "Product delete");
  const confirmSlug = readRequiredString(formData, "confirm_slug", "Product delete");
  const changeSummary = readOptionalString(formData, "change_summary");

  if (confirmSlug !== slug) {
    throw new Error("Product delete confirmation must match the product slug exactly.");
  }

  return {
    slug,
    confirmSlug,
    changeSummary
  };
}

export function buildProductDeleteFromFormData(formData: FormData): ProductDeleteFormInput {
  const { slug, confirmSlug, changeSummary } = readProductDeleteConfirmation(formData);

  return {
    table: "mithron_products",
    identity: {
      slug
    },
    fields: {
      confirm_slug: confirmSlug
    },
    entityId: slug,
    changeSummary: changeSummary ?? `Hard delete product ${slug}`
  };
}

export function buildProductRemoveFromFormData(formData: FormData): ProductDeleteFormInput {
  const { slug, confirmSlug, changeSummary } = readProductDeleteConfirmation(formData);

  return {
    table: "mithron_products",
    identity: {
      slug
    },
    fields: {
      confirm_slug: confirmSlug
    },
    entityId: slug,
    changeSummary: changeSummary ?? `Remove product ${slug}`
  };
}

export function buildProductForceDeleteFromFormData(formData: FormData): ProductDeleteFormInput {
  const { slug, confirmSlug, changeSummary } = readProductDeleteConfirmation(formData);
  if (!readOptionalBoolean(formData, "force_delete")) {
    throw new Error("Force delete must be explicitly confirmed.");
  }

  return {
    table: "mithron_products",
    identity: {
      slug
    },
    fields: {
      confirm_slug: confirmSlug,
      force_delete: true
    },
    entityId: slug,
    changeSummary: changeSummary ?? `Force delete product ${slug}`
  };
}
