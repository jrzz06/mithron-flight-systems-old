import type { Product } from "@/config/types";
import { deriveProductSku } from "@/lib/product-sku";
import {
  compactSearchText,
  fuzzyTokenMatches,
  MIN_SEARCH_QUERY_LENGTH,
  normalizeSearchText,
  SEARCH_SECONDARY_MIN_TOKEN,
  SEARCH_TERTIARY_MIN_TOKEN,
  tokenizeSearchQuery
} from "@/lib/search-query";

export type SearchFieldTier = "primary" | "secondary" | "tertiary";

export type SearchableProductFields = {
  name: string;
  tagline: string;
  slug: string;
  sku: string;
  category: string;
  interests: string[];
  anchors: string[];
  badge: string;
  description: string;
  sourceDescription: string;
  specs: string;
  sourceCatalogId: string;
};

export type TokenFieldMatch = {
  match: boolean;
  tier: SearchFieldTier | null;
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function wordStartsWithToken(text: string, token: string) {
  const normalizedToken = normalizeSearchText(token);
  if (!normalizedToken) return true;

  const normalizedText = normalizeSearchText(text);
  if (normalizedText.startsWith(normalizedToken)) return true;

  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizedToken)}`, "i");
  return pattern.test(text);
}

function primaryTexts(fields: SearchableProductFields, tokenLength: number) {
  const core = [fields.name, fields.tagline, fields.slug, fields.sku];
  if (tokenLength >= 2) {
    core.push(fields.category);
  }
  return core;
}

function secondaryTexts(fields: SearchableProductFields) {
  return [...fields.interests, ...fields.anchors, fields.badge];
}

function tertiaryTexts(fields: SearchableProductFields) {
  return [fields.description, fields.sourceDescription, fields.specs, fields.sourceCatalogId];
}

function textMatchesTokenAtTier(text: string, token: string, tier: SearchFieldTier): boolean {
  const normalizedToken = normalizeSearchText(token);
  if (!normalizedToken) return true;
  if (!text.trim()) return false;

  const tokenLength = normalizedToken.length;

  if (tier === "primary") {
    if (tokenLength <= 2) return wordStartsWithToken(text, normalizedToken);
    if (tokenLength === 3) {
      return (
        wordStartsWithToken(text, normalizedToken) ||
        normalizeSearchText(text).includes(normalizedToken)
      );
    }
    return fuzzyTokenMatches(text, normalizedToken);
  }

  if (tier === "secondary") {
    if (tokenLength < SEARCH_SECONDARY_MIN_TOKEN) return false;
    if (tokenLength === SEARCH_SECONDARY_MIN_TOKEN) return wordStartsWithToken(text, normalizedToken);
    return fuzzyTokenMatches(text, normalizedToken);
  }

  if (tokenLength < SEARCH_TERTIARY_MIN_TOKEN) return false;
  return fuzzyTokenMatches(text, normalizedToken);
}

function tierRank(tier: SearchFieldTier) {
  switch (tier) {
    case "primary":
      return 3;
    case "secondary":
      return 2;
    case "tertiary":
      return 1;
    default:
      return 0;
  }
}

function bestTierForTexts(texts: string[], token: string, tier: SearchFieldTier): SearchFieldTier | null {
  for (const text of texts) {
    if (textMatchesTokenAtTier(text, token, tier)) return tier;
  }
  return null;
}

export function tokenMatchesFields(token: string, fields: SearchableProductFields): TokenFieldMatch {
  const normalizedToken = normalizeSearchText(token);
  if (!normalizedToken) return { match: true, tier: null };

  const tokenLength = normalizedToken.length;
  const primary = bestTierForTexts(primaryTexts(fields, tokenLength), normalizedToken, "primary");
  if (primary) return { match: true, tier: primary };

  const secondary = bestTierForTexts(secondaryTexts(fields), normalizedToken, "secondary");
  if (secondary) return { match: true, tier: secondary };

  const tertiary = bestTierForTexts(tertiaryTexts(fields), normalizedToken, "tertiary");
  if (tertiary) return { match: true, tier: tertiary };

  return { match: false, tier: null };
}

export function queryMatchesProductFields(fields: SearchableProductFields, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  if (normalizedQuery.length < MIN_SEARCH_QUERY_LENGTH) return false;

  const tokens = tokenizeSearchQuery(normalizedQuery);
  if (!tokens.length) return tokenMatchesFields(normalizedQuery, fields).match;

  return tokens.every((token) => tokenMatchesFields(token, fields).match);
}

export function categoryMatchesSearchQuery(category: string, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;

  const tokens = tokenizeSearchQuery(normalizedQuery);
  const categoryFields: SearchableProductFields = {
    name: "",
    tagline: "",
    slug: "",
    sku: "",
    category,
    interests: [],
    anchors: [],
    badge: "",
    description: "",
    sourceDescription: "",
    specs: "",
    sourceCatalogId: ""
  };

  if (!tokens.length) {
    return tokenMatchesFields(normalizedQuery, categoryFields).match;
  }

  return tokens.every((token) => {
    if (normalizeSearchText(token).length < 2) {
      return wordStartsWithToken(category, token);
    }
    return tokenMatchesFields(token, categoryFields).match;
  });
}

export function fieldsFromProduct(product: Product): SearchableProductFields {
  return {
    name: product.name,
    tagline: product.tagline,
    slug: product.slug,
    sku: deriveProductSku(product.slug),
    category: product.category,
    interests: product.interests ?? [],
    anchors: product.anchors ?? [],
    badge: product.badge ?? "",
    description: product.description ?? "",
    sourceDescription: product.sourceDescription ?? "",
    specs: Object.values(product.specs ?? {}).join(" "),
    sourceCatalogId: product.sourceCatalogId ?? ""
  };
}

export function fieldsFromCatalogRow(row: {
  slug: string;
  name: string;
  tagline?: string | null;
  category: string;
  interests?: string[] | null;
  description?: string | null;
  source_description?: string | null;
  source_catalog_id?: string | null;
  specs?: Record<string, string> | null;
  anchors?: string[] | null;
  badge?: string | null;
  badge_text?: string | null;
}): SearchableProductFields {
  return {
    name: row.name,
    tagline: row.tagline ?? "",
    slug: row.slug,
    sku: deriveProductSku(row.slug),
    category: row.category,
    interests: row.interests ?? [],
    anchors: row.anchors ?? [],
    badge: row.badge_text?.trim() ?? "",
    description: row.description ?? "",
    sourceDescription: row.source_description ?? "",
    specs: row.specs ? Object.values(row.specs).join(" ") : "",
    sourceCatalogId: row.source_catalog_id ?? ""
  };
}

function scoreTokenTier(tier: SearchFieldTier | null) {
  switch (tier) {
    case "primary":
      return 700;
    case "secondary":
      return 450;
    case "tertiary":
      return 280;
    default:
      return 0;
  }
}

export function scoreProductSearch(
  fields: SearchableProductFields,
  query: string,
  options?: { sortOrder?: number }
) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery || normalizedQuery.length < MIN_SEARCH_QUERY_LENGTH) return 0;
  if (!queryMatchesProductFields(fields, normalizedQuery)) return 0;

  void options?.sortOrder;

  const name = normalizeSearchText(fields.name);
  const slug = normalizeSearchText(fields.slug);
  const tagline = normalizeSearchText(fields.tagline);
  const category = normalizeSearchText(fields.category);
  const compactName = compactSearchText(fields.name);
  const compactSlug = compactSearchText(fields.slug);
  const compactQuery = compactSearchText(normalizedQuery);

  if (name === normalizedQuery || slug === normalizedQuery) return 1000;
  if (name.startsWith(normalizedQuery) || slug.startsWith(normalizedQuery)) return 950;
  if (compactName === compactQuery || compactSlug === compactQuery) return 940;
  if (category.startsWith(normalizedQuery)) return 900;
  if (tagline.startsWith(normalizedQuery)) return 880;
  if (category.includes(normalizedQuery)) return 820;

  const tokens = tokenizeSearchQuery(normalizedQuery);
  const tokenResults = tokens.map((token) => tokenMatchesFields(token, fields));
  const lowestTier = tokenResults.reduce<SearchFieldTier | null>((current, result) => {
    if (!result.tier) return current;
    if (!current) return result.tier;
    return tierRank(result.tier) < tierRank(current) ? result.tier : current;
  }, null);

  const tierScore = scoreTokenTier(lowestTier);
  const tokenBonus = tokens.length * 40;
  return tierScore + tokenBonus;
}
