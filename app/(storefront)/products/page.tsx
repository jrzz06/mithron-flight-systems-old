import type { Metadata } from "next";
import { Suspense } from "react";
import { attachCatalogProductRatings } from "@/lib/catalog-product-ratings";
import { CatalogPage } from "@/sections/catalog/catalog-page";
import { getCatalogShowroomProducts } from "@/services/catalog";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Products",
  description:
    "Browse the full Mithron store of agriculture drones, mapping drones, site monitoring aircraft, creative aircraft, accessories, and global products.",
  alternates: {
    canonical: "/products"
  },
  openGraph: {
    title: "Mithron Products",
    description:
      "Curated drone aircraft and professional equipment for agriculture, mapping, site monitoring, and worksites."
  },
  robots: {
    index: true,
    follow: true
  }
};

function CatalogPageFallback() {
  return <div className="min-h-[60vh] animate-pulse bg-[#eef0f3]" aria-hidden="true" />;
}

async function ProductsPageContent() {
  let products: Awaited<ReturnType<typeof getCatalogShowroomProducts>> = [];
  try {
    products = await getCatalogShowroomProducts();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[products] catalog showroom failed; rendering empty catalog: ${message}`);
  }

  products = await attachCatalogProductRatings(products);

  return (
    <CatalogPage
      title="Products"
      subtitle="Browse drones, accessories, and work-ready products from Mithron."
      products={products}
      presentation="showroom"
      listingMode="global"
    />
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<CatalogPageFallback />}>
      <ProductsPageContent />
    </Suspense>
  );
}
