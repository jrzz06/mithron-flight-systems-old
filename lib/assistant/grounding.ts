import { getProductBySlug, searchCatalogProducts, loadProductForPage } from "@/services/catalog";
import type { Product } from "@/config/types";

type GroundedProduct = {
  slug: string;
  name: string;
  category: string;
  tagline?: string;
  price?: number | null;
  availability?: string | null;
  specs?: Record<string, string>;
  url: string;
};

export type AssistantContextPack = {
  products: GroundedProduct[];
  notes: string[];
};

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function productUrlFromSlug(slug: string) {
  return `/product/${slug}`;
}

function pickSpecs(specs: Product["specs"]) {
  if (!specs || typeof specs !== "object") return undefined;
  const entries = Object.entries(specs).filter(([key, value]) => Boolean(key && value));
  const prioritized = entries.slice(0, 14);
  return Object.fromEntries(prioritized);
}

function mapProduct(product: Product): GroundedProduct {
  const availability =
    safeText(product.specs?.Availability)
    || safeText(product.specs?.availability)
    || safeText(product.specs?.["Availability (source)"]);

  return {
    slug: product.slug,
    name: product.name,
    category: product.category,
    tagline: safeText(product.tagline),
    price: typeof product.price === "number" ? product.price : null,
    availability: availability || null,
    specs: pickSpecs(product.specs),
    url: productUrlFromSlug(product.slug)
  };
}

async function loadProductsByQuery(query: string, limit: number) {
  const results = await searchCatalogProducts(query, Math.min(Math.max(limit, 1), 6));
  const slugs = results.map((row) => row.slug).filter(Boolean);
  const loaded = await Promise.all(slugs.map((slug) => getProductBySlug(slug)));
  return loaded.filter((product): product is Product => Boolean(product));
}

export async function buildAssistantContextPack(input: {
  message: string;
  selectedProductSlug?: string | null;
}): Promise<AssistantContextPack> {
  const notes: string[] = [];
  const picked: Product[] = [];

  const selected = safeText(input.selectedProductSlug);
  if (selected) {
    const result = await loadProductForPage(selected);
    if (result.status === "ready") {
      picked.push(result.product);
    } else {
      notes.push("Selected product could not be loaded.");
    }
  }

  const wantsOptions = /\b(list|options|suggest|recommend|products|models|show me)\b/i.test(input.message);
  const wantsCompare = /\b(compare|vs|versus)\b/i.test(input.message);
  if ((wantsOptions || wantsCompare) && picked.length < 3) {
    const query = input.message.slice(0, 120);
    const fromQuery = await loadProductsByQuery(query, 3 - picked.length);
    for (const product of fromQuery) {
      if (picked.some((p) => p.slug === product.slug)) continue;
      picked.push(product);
      if (picked.length >= 3) break;
    }
  }

  return {
    products: picked.map(mapProduct),
    notes
  };
}

