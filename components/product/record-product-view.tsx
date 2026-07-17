"use client";

import { useEffect } from "react";
import type { MediaAsset } from "@/config/types";
import { recordRecentlyViewedProduct } from "@/lib/recently-viewed-products";

export function RecordProductView({
  slug,
  name,
  price,
  category,
  tagline,
  image,
  badge
}: {
  slug: string;
  name: string;
  price: number;
  category: string;
  tagline: string;
  image: MediaAsset;
  badge?: string;
}) {
  useEffect(() => {
    recordRecentlyViewedProduct({
      slug,
      name,
      price,
      category,
      tagline,
      badge,
      image: { src: image.src, responsive: image.responsive }
    });
    window.dispatchEvent(new Event("mithron:recently-viewed"));
  }, [badge, category, image.responsive, image.src, name, price, slug, tagline]);

  return null;
}
