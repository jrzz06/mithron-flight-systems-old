import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { catalogCategoryDefinitions } from "@/lib/catalog-categories";

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  if (query) {
    return {
      title: `Search results for "${query}"`,
      description: `Mithron product matches for ${query}: agriculture drones, mapping drones, site monitoring, and accessories.`,
      robots: {
        index: false,
        follow: true
      }
    };
  }

  return {
    title: "Search Products",
    description: "Search Mithron for agriculture drones, mapping drones, site monitoring, flight controllers, batteries, and accessories.",
    alternates: {
      canonical: "/search"
    },
    openGraph: {
      title: "Search Mithron Products",
      description: "Find professional drone aircraft, spares, and work-ready equipment across agriculture, mapping, and site monitoring."
    }
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  if (query) {
    redirect(`/products?q=${encodeURIComponent(query)}`);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="max-w-2xl">
        <p className="type-meta text-sm text-[#5f6b7a]">Product search</p>
        <h1 className="type-display mt-2 text-4xl font-semibold tracking-tight text-[#101828]">
          Search Mithron
        </h1>
        <p className="type-body mt-3 text-base text-[#475467]">
          Search agriculture drones, mapping drones, site monitoring aircraft, controllers, batteries, and accessories.
        </p>
      </header>

      <section className="mt-10 rounded-2xl border border-[#e4e7ec] bg-[#f8fafc] p-8">
        <h2 className="type-card-title text-xl text-[#101828]">Browse by category</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {catalogCategoryDefinitions.map((category) => (
            <Link
              key={category.slug}
              href={category.href}
              title={`Browse ${category.label}`}
              className="rounded-full border border-[#d0d5dd] bg-white px-4 py-2 text-sm text-[#344054] hover:border-[#98a2b3]"
            >
              {category.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
