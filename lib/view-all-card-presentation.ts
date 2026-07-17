import type { CSSProperties } from "react";

export type ViewAllCardPresentation = {
  objectPosition: string;
  scale: number;
  padding: string;
};

const DEFAULT_PRESENTATION: ViewAllCardPresentation = {
  objectPosition: "50% 46%",
  scale: 1,
  padding: "8px 8px 0"
};

const SLUG_OVERRIDES: Record<string, Partial<ViewAllCardPresentation>> = {
  "source-agri-kisan-drone-small-8-liter": {
    objectPosition: "50% 44%",
    scale: 1.04,
    padding: "4px 8px 0"
  },
  "source-agri-kisan-drone-10-liter": {
    objectPosition: "50% 42%",
    scale: 1.05,
    padding: "0 8px 0"
  },
  "source-agri-kisan-drone-16-liter": {
    objectPosition: "50% 40%",
    scale: 1.06,
    padding: "0 6px 0"
  },
  "source-8kg-seed-spreader-drone-tc-certified": {
    objectPosition: "50% 48%",
    scale: 1.08,
    padding: "8px 4px 0"
  },
  "source-india-spreader-drone": {
    objectPosition: "50% 45%",
    scale: 1.06,
    padding: "6px 8px 0"
  },
  "source-siyi-mk-32-agriculture-transmitter-rc-controller-hdmi": {
    objectPosition: "50% 50%",
    scale: 1.02,
    padding: "12px 12px 0"
  },
  "source-decafly-d5x-cfrp-frame": {
    objectPosition: "50% 48%",
    scale: 1.1,
    padding: "8px 8px 0"
  },
  "source-nuno-no-tc-required": {
    objectPosition: "50% 43%",
    scale: 1.04,
    padding: "4px 8px 0"
  },
  "source-monal-4k": {
    objectPosition: "50% 44%",
    scale: 1.03,
    padding: "6px 8px 0"
  },
  "zio": {
    objectPosition: "50% 47%",
    scale: 1.02,
    padding: "10px 10px 0"
  },
  "pixy-mr": {
    objectPosition: "50% 45%",
    scale: 1.04,
    padding: "8px 8px 0"
  }
};

export function resolveViewAllCardPresentation(slug?: string): ViewAllCardPresentation {
  if (!slug) {
    return DEFAULT_PRESENTATION;
  }

  const override = SLUG_OVERRIDES[slug];
  if (!override) {
    return DEFAULT_PRESENTATION;
  }

  return {
    objectPosition: override.objectPosition ?? DEFAULT_PRESENTATION.objectPosition,
    scale: override.scale ?? DEFAULT_PRESENTATION.scale,
    padding: override.padding ?? DEFAULT_PRESENTATION.padding
  };
}

export function viewAllCardPresentationStyle(presentation: ViewAllCardPresentation) {
  return {
    "--view-all-object-position": presentation.objectPosition,
    "--view-all-image-scale": String(presentation.scale),
    "--view-all-image-padding": presentation.padding
  } as CSSProperties;
}
