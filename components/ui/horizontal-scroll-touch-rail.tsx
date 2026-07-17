"use client";

import { forwardRef } from "react";
import { useHorizontalScrollTouchGuard } from "@/hooks/use-horizontal-scroll-touch-guard";
import type { ReactNode } from "react";

type HorizontalScrollTouchRailProps = {
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "data-testid"?: string;
  "data-shelf-layout"?: string;
};

export const HorizontalScrollTouchRail = forwardRef<HTMLDivElement, HorizontalScrollTouchRailProps>(
  function HorizontalScrollTouchRail(
    { className, children, "aria-label": ariaLabel, "data-testid": testId, "data-shelf-layout": shelfLayout },
    ref
  ) {
    const touchGuard = useHorizontalScrollTouchGuard();

    return (
      <div
        ref={ref}
        className={className}
        data-testid={testId}
        data-shelf-layout={shelfLayout}
        aria-label={ariaLabel}
        {...touchGuard}
      >
        {children}
      </div>
    );
  }
);
