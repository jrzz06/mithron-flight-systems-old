export type CatalogEditorialPresentation = {
  objectPosition: string;
  scale: number;
};

const DEFAULT_PRESENTATION: CatalogEditorialPresentation = {
  objectPosition: "50% 46%",
  scale: 1.22
};

const SLUG_OVERRIDES: Record<string, Partial<CatalogEditorialPresentation>> = {
  "source-8kg-seed-spreader-drone-tc-certified": {
    objectPosition: "50% 50%",
    scale: 1.16
  },
  "source-india-spreader-drone": {
    objectPosition: "50% 48%",
    scale: 1.04
  }
};

export function resolveCatalogEditorialPresentation(slug: string): CatalogEditorialPresentation {
  const override = SLUG_OVERRIDES[slug];
  if (!override) {
    return DEFAULT_PRESENTATION;
  }

  return {
    objectPosition: override.objectPosition ?? DEFAULT_PRESENTATION.objectPosition,
    scale: override.scale ?? DEFAULT_PRESENTATION.scale
  };
}
