import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorRenderedContent } from "@/components/editor/editor-rendered-content";
import { getPublicCmsSnapshot } from "@/services/cms";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "About Us – Mithron",
  description: "Learn more about Mithron's technology and team building reliable drones and services."
};

export default async function AboutPage() {
  const cms = await getPublicCmsSnapshot();
  const title = cms.footer.leadTitle?.trim() || "Drones for teams that work outdoors.";
  const body = cms.footer.leadBody?.trim()
    || "Mithron builds and supplies agriculture, mapping, site monitoring, and media drones with an easy-to-manage product range.";
  const trustCards = cms.trustCards?.slice(0, 3) ?? [];

  return (
    <main className="surface-page inner-page min-h-screen">
      <nav aria-label="Breadcrumb" className="mx-auto mb-6 flex max-w-[min(100%,var(--ds-container-checkout))] flex-wrap items-center gap-2 px-[var(--fluid-page-inline)] text-sm text-slate-500 animate-fade-in md:px-0">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
          <Home className="size-3.5" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Home</span>
        </Link>
        <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
        <span className="font-medium text-slate-950" aria-current="page">
          About Us
        </span>
      </nav>

      <section className="mx-auto grid max-w-[min(100%,var(--ds-container-checkout))] gap-10 rounded-[var(--ds-r-xl)] border border-[var(--surface-border)] bg-[var(--surface-card)] p-[clamp(1.5rem,4vw,3rem)] md:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="type-meta text-slate-500">About Mithron</p>
          <h1 className="type-page mt-4 max-w-2xl">{title}</h1>
        </div>
        <div className="grid content-between gap-8">
          <EditorRenderedContent html={body} className="type-subtitle text-slate-600" />
          {trustCards.length ? (
            <div className="grid gap-3">
              {trustCards.map((card) => (
                <article key={card.id} className="rounded-2xl border border-[var(--surface-border)] bg-white/60 p-4">
                  <p className="text-sm font-semibold text-slate-900">{card.title}</p>
                  {card.body ? (
                    <EditorRenderedContent html={card.body} className="mt-2 text-sm leading-6 text-slate-600" />
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/products">
                Shop products
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/contact">Contact team</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
