"use client";

import { HorizontalScrollTouchRail } from "@/components/ui/horizontal-scroll-touch-rail";
import type { ReactNode } from "react";
import styles from "./home-related-articles-section.module.css";

export function HomeRelatedArticlesGallery({ children }: { children: ReactNode }) {
  return (
    <HorizontalScrollTouchRail className={styles.gallery} aria-label="Related articles">
      {children}
    </HorizontalScrollTouchRail>
  );
}
