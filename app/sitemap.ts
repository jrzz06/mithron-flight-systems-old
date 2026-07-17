import type { MetadataRoute } from "next";
import { CATALOG_CATEGORY_SLUGS } from "@/lib/catalog-categories";
import { toAbsoluteUrl } from "@/lib/site-url";
import { getPublishedProductSitemapEntries } from "@/services/catalog";

const STATIC_STOREFRONT_PATHS = [
  "/",
  "/products",
  "/search",
  "/about",
  "/contact",
  "/product/mithron-care-plus"
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = STATIC_STOREFRONT_PATHS.map((path) => ({
    url: toAbsoluteUrl(path),
    lastModified: now,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7
  }));

  const categoryEntries: MetadataRoute.Sitemap = CATALOG_CATEGORY_SLUGS.map((slug) => ({
    url: toAbsoluteUrl(`/category/${slug}`),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8
  }));

  const products = await getPublishedProductSitemapEntries();
  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: toAbsoluteUrl(product.productUrl ?? `/product/${product.slug}`),
    lastModified: product.updatedAt ? new Date(product.updatedAt) : now,
    changeFrequency: "weekly",
    priority: 0.6
  }));

  return [...staticEntries, ...categoryEntries, ...productEntries];
}
