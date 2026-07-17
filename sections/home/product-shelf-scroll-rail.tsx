"use client";

import { HorizontalScrollTouchRail } from "@/components/ui/horizontal-scroll-touch-rail";
import type { ReactNode } from "react";

type ProductShelfScrollRailProps = {
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "data-testid"?: string;
  "data-shelf-layout"?: string;
};

export function ProductShelfScrollRail({
  className,
  children,
  "aria-label": ariaLabel,
  "data-testid": testId,
  "data-shelf-layout": shelfLayout
}: ProductShelfScrollRailProps) {
  return (
    <HorizontalScrollTouchRail
      className={className}
      data-testid={testId}
      data-shelf-layout={shelfLayout}
      aria-label={ariaLabel}
    >
      {children}
    </HorizontalScrollTouchRail>
  );
}
