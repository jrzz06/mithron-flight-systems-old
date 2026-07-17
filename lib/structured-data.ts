import type { Product } from "@/config/types";
import { calculateProductTaxBreakdown } from "@/lib/product-tax";
import { getProductOverviewText } from "@/lib/product-detail-content";
import type { CatalogSearchResult } from "@/services/catalog";
import { getSiteOrigin, toAbsoluteUrl } from "@/lib/site-url";
import { getCatalogCategoryByLabel } from "@/lib/catalog-categories";

function organizationId() {
  return `${getSiteOrigin()}/#organization`;
}

function websiteId() {
  return `${getSiteOrigin()}/#website`;
}

function schemaAvailability(product: Product) {
  const availability = product.specs.Availability?.toLowerCase() ?? "";
  if (/out of stock|sold out|unavailable/.test(availability)) {
    return "https://schema.org/OutOfStock";
  }
  if (/pre-?order|backorder/.test(availability)) {
    return "https://schema.org/PreOrder";
  }
  return "https://schema.org/InStock";
}

function normalizeImageUrl(src: string) {
  if (/^https?:\/\//i.test(src)) {
    return src;
  }
  return toAbsoluteUrl(src);
}

function productImages(product: Product) {
  const images = [product.hero?.src, product.image?.src, ...product.gallery.map((item) => item.src)]
    .filter(Boolean)
    .map((src) => normalizeImageUrl(src));

  return [...new Set(images)];
}

function productDescription(product: Product) {
  return product.seoDescription?.trim()
    || product.tagline?.trim()
    || getProductOverviewText(product).trim()
    || product.name;
}

function productOfferPrice(product: Product) {
  const breakdown = calculateProductTaxBreakdown({
    unitPrice: product.price,
    quantity: 1,
    chargeTax: product.chargeTax,
    taxGroup: product.taxGroup,
    taxRate: product.taxRate,
    taxIncluded: product.taxIncluded
  });

  return breakdown.lineTotal.toFixed(2);
}

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId(),
    name: "Mithron",
    url: toAbsoluteUrl("/"),
    logo: toAbsoluteUrl("/favicon.svg"),
    sameAs: [] as string[]
  };
}

export function buildWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": websiteId(),
    name: "Mithron",
    url: toAbsoluteUrl("/"),
    publisher: { "@id": organizationId() },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${toAbsoluteUrl("/products")}?q={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  };
}

export function buildProductJsonLd(product: Product) {
  const productUrl = toAbsoluteUrl(product.productUrl ?? `/product/${product.slug}`);
  const images = productImages(product);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: product.name,
    description: productDescription(product),
    sku: product.slug,
    category: product.category,
    image: images,
    brand: {
      "@type": "Brand",
      name: "Mithron"
    },
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "INR",
      price: productOfferPrice(product),
      availability: schemaAvailability(product),
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": organizationId() }
    }
  };
}

export function buildProductBreadcrumbJsonLd(product: Product) {
  const productUrl = toAbsoluteUrl(product.productUrl ?? `/product/${product.slug}`);
  const categoryDef = getCatalogCategoryByLabel(product.category);

  const items: object[] = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: toAbsoluteUrl("/")
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Products",
      item: toAbsoluteUrl("/products")
    }
  ];

  if (categoryDef) {
    items.push({
      "@type": "ListItem",
      position: 3,
      name: categoryDef.label,
      item: toAbsoluteUrl(categoryDef.href)
    });
    items.push({
      "@type": "ListItem",
      position: 4,
      name: product.name,
      item: productUrl
    });
  } else {
    items.push({
      "@type": "ListItem",
      position: 3,
      name: product.name,
      item: productUrl
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items
  };
}

export function buildSiteStructuredData() {
  return [buildOrganizationJsonLd(), buildWebSiteJsonLd()];
}

export function buildSearchResultsItemListJsonLd(query: string, results: CatalogSearchResult[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Search results for ${query}`,
    numberOfItems: results.length,
    itemListElement: results.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: product.name,
      url: toAbsoluteUrl(`/product/${product.slug}`),
      image: product.image?.src ? normalizeImageUrl(product.image.src) : undefined
    }))
  };
}

export function buildProductStructuredData(product: Product) {
  return [buildProductJsonLd(product), buildProductBreadcrumbJsonLd(product)];
}
