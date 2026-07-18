import { Cloud, Download, ShieldCheck, Sparkles } from "lucide-react";
import { heroAssets } from "@/config/assets";
import { CatalogPage } from "@/sections/catalog/catalog-page";
import { getFeaturedProducts } from "@/services/catalog";

export const revalidate = 60;

export default async function MithronCarePlusPage() {
  const products = await getFeaturedProducts();

  return (
    <div className="surface-page">
      <CatalogPage
        title="Mithron Care+"
        subtitle="Training, maintenance, flight support, and premium care services for your drone fleet."
        products={products.slice(0, 4)}
        heroImage={heroAssets.ag10Command}
      />
      <section className="mx-auto grid max-w-[min(100%,var(--ds-container-catalog))] gap-4 px-[var(--fluid-page-inline)] pb-16 md:grid-cols-2 lg:grid-cols-4 lg:px-16">
        {[
          [Cloud, "Flight data archive"],
          [Download, "Fast reporting"],
          [Sparkles, "Operator-first training"],
          [ShieldCheck, "Protected fleet support"]
        ].map(([Icon, title]) => (
          <div key={String(title)} className="ambient-surface ambient-dark rounded-2xl border border-[var(--surface-border)] p-[clamp(1.25rem,4vw,2rem)]">
            <Icon className="mb-8 size-8" />
            <h2 className="type-card-title text-xl">{String(title)}</h2>
          </div>
        ))}
      </section>
    </div>
  );
}
