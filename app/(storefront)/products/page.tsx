import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CatalogPage } from "@/sections/catalog/catalog-page";
import {
  getCatalogCategoryDefinition,
  parseProductsCategoryParam
} from "@/lib/catalog-categories";
import {
  parseCatalogProductGroupParam,
  parseCatalogSearchQueryParam
} from "@/lib/catalog-product-listing";
import { getCatalogShowroomProducts } from "@/services/catalog";

type ProductsPageProps = {
  searchParams: Promise<{ category?: string; filter?: string; q?: string }>;
};

export async function generateMetadata({ searchParams }: ProductsPageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const query = parseCatalogSearchQueryParam(q);

  if (query) {
    return {
      title: `Results for "${query}"`,
      description: `Mithron product matches for ${query}: agriculture drones, mapping drones, site monitoring, and accessories.`,
      robots: {
        index: false,
        follow: true
      }
    };
  }

  return {
    title: "Products",
    description: "Browse the full Mithron store of agriculture drones, mapping drones, site monitoring aircraft, creative aircraft, accessories, and global products.",
    alternates: {
      canonical: "/products"
    },
    openGraph: {
      title: "Mithron Products",
      description: "Curated drone aircraft and professional equipment for agriculture, mapping, site monitoring, and worksites."
    }
  };
}

function CatalogPageFallback() {
  return <div className="min-h-[60vh] animate-pulse bg-[#eef0f3]" aria-hidden="true" />;
}

async function ProductsPageContent({
  categoryParam,
  filterParam,
  queryParam
}: {
  categoryParam?: string;
  filterParam?: string;
  queryParam?: string;
}) {
  const categorySlug = parseProductsCategoryParam(categoryParam);

  if (categorySlug === "accessories") {
    redirect("/products?filter=accessories-spare-parts");
  }

  if (categorySlug === "global-products") {
    redirect("/products?filter=global-products");
  }

  if (categorySlug) {
    redirect(getCatalogCategoryDefinition(categorySlug).href);
  }

  const initialGroup = parseCatalogProductGroupParam(filterParam);
  const initialQuery = parseCatalogSearchQueryParam(queryParam);
  const products = await getCatalogShowroomProducts();

  return (
    <CatalogPage
      title="Products"
      subtitle="Browse drones, accessories, and work-ready products from Mithron."
      products={products}
      presentation="showroom"
      listingMode="global"
      initialGroup={initialGroup}
      initialQuery={initialQuery}
    />
  );
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { category, filter, q } = await searchParams;

  return (
    <Suspense fallback={<CatalogPageFallback />}>
      <ProductsPageContent categoryParam={category} filterParam={filter} queryParam={q} />
    </Suspense>
  );
}
