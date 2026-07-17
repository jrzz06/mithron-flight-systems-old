"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { HomepageCmsContent } from "@/config/homepage-cms";
import type { HomepageCmsV2Content } from "@/config/homepage-cms-v2";
import type { Product } from "@/config/types";
import type { HomepageSectionId } from "@/config/homepage-section-registry";

export type HomepageBuilderDraft = {
  homepageCms: HomepageCmsContent;
  homepageV2: HomepageCmsV2Content;
  shelfProductSlugs: Record<string, string[]>;
  products: Product[];
};

type HomepageBuilderContextValue = {
  sectionId: HomepageSectionId;
  draft: HomepageBuilderDraft;
  setShelfSlugs: (shelfKey: string, slugs: string[]) => void;
  patchHomepageV2: (patch: Partial<HomepageCmsV2Content>) => void;
  patchHomepageCms: (patch: Partial<HomepageCmsContent>) => void;
  patchShelf: (shelfKey: keyof HomepageCmsContent["shelves"], patch: Partial<HomepageCmsContent["shelves"]["droneWorld"]>) => void;
};

const HomepageBuilderContext = createContext<HomepageBuilderContextValue | null>(null);

export function HomepageBuilderProvider({
  sectionId,
  homepageCms,
  homepageV2,
  products,
  shelfProductSlugs,
  children
}: {
  sectionId: HomepageSectionId;
  homepageCms: HomepageCmsContent;
  homepageV2: HomepageCmsV2Content;
  products: Product[];
  shelfProductSlugs?: Record<string, string[]>;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<HomepageBuilderDraft>(() => ({
    homepageCms,
    homepageV2,
    products,
    shelfProductSlugs: shelfProductSlugs ?? {}
  }));

  const setShelfSlugs = useCallback((shelfKey: string, slugs: string[]) => {
    setDraft((current) => ({
      ...current,
      shelfProductSlugs: { ...current.shelfProductSlugs, [shelfKey]: slugs },
      homepageCms: {
        ...current.homepageCms,
        shelves: {
          ...current.homepageCms.shelves,
          [shelfKey]: {
            ...current.homepageCms.shelves[shelfKey as keyof HomepageCmsContent["shelves"]],
            productSlugs: slugs
          }
        }
      }
    }));
  }, []);

  const patchHomepageV2 = useCallback((patch: Partial<HomepageCmsV2Content>) => {
    setDraft((current) => ({
      ...current,
      homepageV2: {
        ...current.homepageV2,
        ...patch,
        miniCarousel: patch.miniCarousel
          ? { ...current.homepageV2.miniCarousel, ...patch.miniCarousel }
          : current.homepageV2.miniCarousel,
        banners: patch.banners ? { ...current.homepageV2.banners, ...patch.banners } : current.homepageV2.banners,
        reviews: patch.reviews ? { ...current.homepageV2.reviews, ...patch.reviews } : current.homepageV2.reviews,
        relatedArticles: patch.relatedArticles
          ? { ...current.homepageV2.relatedArticles, ...patch.relatedArticles }
          : current.homepageV2.relatedArticles
      }
    }));
  }, []);

  const patchHomepageCms = useCallback((patch: Partial<HomepageCmsContent>) => {
    setDraft((current) => ({ ...current, homepageCms: { ...current.homepageCms, ...patch } }));
  }, []);

  const patchShelf = useCallback(
    (shelfKey: keyof HomepageCmsContent["shelves"], patch: Partial<HomepageCmsContent["shelves"]["droneWorld"]>) => {
      setDraft((current) => ({
        ...current,
        homepageCms: {
          ...current.homepageCms,
          shelves: {
            ...current.homepageCms.shelves,
            [shelfKey]: { ...current.homepageCms.shelves[shelfKey], ...patch }
          }
        }
      }));
    },
    []
  );

  const value = useMemo(
    () => ({ sectionId, draft, setShelfSlugs, patchHomepageV2, patchHomepageCms, patchShelf }),
    [draft, patchHomepageCms, patchHomepageV2, patchShelf, sectionId, setShelfSlugs]
  );

  return <HomepageBuilderContext.Provider value={value}>{children}</HomepageBuilderContext.Provider>;
}

export function useHomepageBuilder() {
  const context = useContext(HomepageBuilderContext);
  if (!context) throw new Error("useHomepageBuilder must be used within HomepageBuilderProvider");
  return context;
}

export function useOptionalHomepageBuilder() {
  return useContext(HomepageBuilderContext);
}
