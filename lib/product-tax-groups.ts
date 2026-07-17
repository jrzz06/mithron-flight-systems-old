export const PRODUCT_TAX_GROUP_IDS = [
  "products-default",
  "agri-accessories",
  "non-agri-drones",
  "non-agri-accessories",
  "agri-drones"
] as const;

export type ProductTaxGroupId = (typeof PRODUCT_TAX_GROUP_IDS)[number];

export type ProductTaxGroupDefinition = {
  id: ProductTaxGroupId;
  label: string;
  rate: number;
  description: string;
};

export const PRODUCT_TAX_GROUPS: ProductTaxGroupDefinition[] = [
  {
    id: "products-default",
    label: "Products (default rate)",
    rate: 18,
    description: "Standard 18% Indian GST for general catalog products."
  },
  {
    id: "agri-accessories",
    label: "Agri accessories",
    rate: 12,
    description: "12% Indian GST for agricultural accessories, spare parts, and field support components."
  },
  {
    id: "non-agri-drones",
    label: "Non Agri Drones",
    rate: 18,
    description: "18% Indian GST for video, surveillance, creative, and industrial drone platforms."
  },
  {
    id: "non-agri-accessories",
    label: "Non Agri accessories",
    rate: 18,
    description: "18% Indian GST for general accessories that are not classified as agricultural equipment."
  },
  {
    id: "agri-drones",
    label: "Agri Drones",
    rate: 5,
    description: "5% Indian GST for agricultural drone platforms."
  }
];

const taxGroupById = new Map(PRODUCT_TAX_GROUPS.map((group) => [group.id, group]));

export function isProductTaxGroupId(value: string | null | undefined): value is ProductTaxGroupId {
  return Boolean(value && PRODUCT_TAX_GROUP_IDS.includes(value as ProductTaxGroupId));
}

export function getProductTaxGroup(id: string | null | undefined): ProductTaxGroupDefinition {
  if (isProductTaxGroupId(id)) {
    return taxGroupById.get(id)!;
  }
  return taxGroupById.get("products-default")!;
}

export function resolveProductTaxRate(input: {
  taxGroup?: string | null;
  taxRate?: number | null;
  chargeTax?: boolean | null;
}) {
  if (input.chargeTax === false) return 0;
  if (input.taxRate !== null && input.taxRate !== undefined && Number.isFinite(input.taxRate)) {
    return Math.max(0, input.taxRate);
  }
  return getProductTaxGroup(input.taxGroup).rate;
}

export function inferProductTaxGroup(category: string, name: string): ProductTaxGroupId {
  const haystack = `${category} ${name}`.toLowerCase();
  const isAgri = /agri|kisan|agricultur|spray|spreader|festo|seeder|crop|field/.test(haystack);
  const isDrone = /drone|uav|quad|hexa|octa|multirotor|vtol|air frame/.test(haystack);
  const normalizedCategory = category.trim().toLowerCase();

  if (normalizedCategory === "accessories") {
    return isAgri ? "agri-accessories" : "non-agri-accessories";
  }

  if (normalizedCategory === "agri drones" || (isAgri && isDrone)) {
    return "agri-drones";
  }

  if (["video drones", "creative drones", "surveillance drones", "survey drones", "global products"].includes(normalizedCategory)) {
    return "non-agri-drones";
  }

  if (isAgri) {
    return isDrone ? "agri-drones" : "agri-accessories";
  }

  if (isDrone) {
    return "non-agri-drones";
  }

  return "products-default";
}
