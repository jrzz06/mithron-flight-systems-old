"use client";

import { useEffect, useState } from "react";
import {
  getRecentlyViewedForDisplay,
  readRecentlyViewedProducts,
  type RecentlyViewedProduct
} from "@/lib/recently-viewed-products";

export function useRecentlyViewedProducts(currentSlug: string) {
  const [items, setItems] = useState<RecentlyViewedProduct[]>([]);

  useEffect(() => {
    const sync = () => {
      setItems(getRecentlyViewedForDisplay(currentSlug, readRecentlyViewedProducts()));
    };

    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("mithron:recently-viewed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("mithron:recently-viewed", sync);
    };
  }, [currentSlug]);

  return items;
}
