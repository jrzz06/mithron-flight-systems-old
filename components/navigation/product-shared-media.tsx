"use client";

import type { ReactNode } from "react";
import { ViewTransition } from "react";
import { productMediaTransitionName } from "@/lib/navigation/product-transition";

/**
 * Shared-element anchor for product card image ↔ PDP hero morph.
 * Falls back to a normal mount when View Transitions are unavailable.
 */
export function ProductSharedMedia({
  slug,
  children
}: {
  slug: string;
  children: ReactNode;
}) {
  return (
    <ViewTransition name={productMediaTransitionName(slug)} share="product-media-morph">
      {children}
    </ViewTransition>
  );
}
