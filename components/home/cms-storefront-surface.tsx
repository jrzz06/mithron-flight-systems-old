import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EditorRenderedContent } from "@/components/editor/editor-rendered-content";
import { MithronCardImage } from "@/components/media/mithron-card-image";
import type { PromotionalCampaignContent, TrustCardContent } from "@/services/cms";

type CmsStorefrontSurfaceProps = {
  promotionalCampaigns: PromotionalCampaignContent[];
  trustCards: TrustCardContent[];
};

export function CmsStorefrontSurface({ promotionalCampaigns, trustCards }: CmsStorefrontSurfaceProps) {
  if (promotionalCampaigns.length === 0 && trustCards.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 md:px-10" aria-label="Featured campaigns and trust highlights">
      {promotionalCampaigns.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {promotionalCampaigns.map((campaign) => (
            <article
              key={campaign.id}
              className="rounded-[28px] border border-white/10 bg-[#080b0f]/[0.045] p-6 shadow-[0_24px_80px_rgba(0,0,0,.35)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7ce7c9]">{campaign.label}</p>
              <h2 className="mt-3 font-[var(--type-display)] text-2xl font-semibold tracking-[-0.03em] text-white">
                {campaign.headline}
              </h2>
              {campaign.body ? (
                <EditorRenderedContent
                  html={campaign.body}
                  className="mt-3 text-sm leading-7 text-white/62"
                />
              ) : null}
              {campaign.href && campaign.ctaLabel ? (
                <Link
                  href={campaign.href}
                  className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#7ce7c9]"
                >
                  {campaign.ctaLabel}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {trustCards.length > 0 ? (
        <div className={`grid gap-4 ${promotionalCampaigns.length > 0 ? "mt-8" : ""} md:grid-cols-3`}>
          {trustCards.map((card) => (
            <article
              key={card.id}
              className={`rounded-[24px] border border-white/10 bg-[#080b0f]/[0.04] p-5 ${card.isFeature ? "md:col-span-2" : ""}`}
            >
              <MithronCardImage
                src={card.imageSrc}
                alt={card.imageAlt}
                fill={false}
                width={640}
                height={360}
                className={card.imageClassName}
                sizes="(max-width: 768px) 100vw, 640px"
              />
              <h3 className="mt-4 text-lg font-semibold text-white">{card.title}</h3>
              <EditorRenderedContent html={card.body} className="mt-2 text-sm leading-7 text-white/60" />
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
