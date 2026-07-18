import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import {
  getCatalogCategoryDefinition,
  interestSlugToCategorySlug
} from "@/lib/catalog-categories";
import { getProductsByInterest } from "@/services/catalog";
import { getPublicCmsSnapshot } from "@/services/cms";
import { CatalogPage } from "@/sections/catalog/catalog-page";

type InterestPageProps = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 60;

export async function generateStaticParams() {
  const cms = await getPublicCmsSnapshot();
  return cms.home.interests.map((interest) => ({ slug: interest.slug }));
}

export async function generateMetadata({ params }: InterestPageProps): Promise<Metadata> {
  const { slug } = await params;
  const cms = await getPublicCmsSnapshot();
  const interest = cms.home.interests.find((item) => item.slug === slug);
  return {
    title: interest ? `${interest.label} - Mithron` : "Interest not found"
  };
}

function CatalogPageFallback() {
  return <div className="min-h-[60vh] animate-pulse bg-[#eef0f3]" aria-hidden="true" />;
}

async function InterestPageContent({ slug }: { slug: string }) {
  const categorySlug = interestSlugToCategorySlug[slug];
  if (categorySlug) {
    redirect(getCatalogCategoryDefinition(categorySlug).href);
  }

  const cms = await getPublicCmsSnapshot();
  const interest = cms.home.interests.find((item) => item.slug === slug);
  if (!interest) notFound();
  const products = await getProductsByInterest(slug);

  return (
    <CatalogPage
      title={interest.label}
      subtitle={interest.headline}
      products={products}
      heroImage={interest.image.src}
    />
  );
}

export default async function InterestPage({ params }: InterestPageProps) {
  const { slug } = await params;

  return (
    <Suspense fallback={<CatalogPageFallback />}>
      <InterestPageContent slug={slug} />
    </Suspense>
  );
}
