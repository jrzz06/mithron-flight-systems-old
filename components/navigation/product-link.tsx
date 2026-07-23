"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  type ComponentProps,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
  type TouchEvent
} from "react";
import {
  PRODUCT_OPEN_TRANSITION,
  prepareProductDestinationScroll,
  prefetchProductDestination,
  productHref
} from "@/lib/navigation/product-transition";

type ProductLinkProps = Omit<
  ComponentProps<typeof Link>,
  "href" | "transitionTypes" | "scroll"
> & {
  slug: string;
  /** Primary product image URL to warm before navigation. */
  prefetchImageSrc?: string | null;
  children: ReactNode;
};

/**
 * Product card → PDP navigation.
 * Captures the click immediately, prefetches route + hero image, freezes scroll
 * restoration, and tags the navigation for View Transitions.
 */
export function ProductLink({
  slug,
  prefetchImageSrc,
  onClick,
  onMouseEnter,
  onFocus,
  onTouchStart,
  onNavigate,
  children,
  ...props
}: ProductLinkProps) {
  const router = useRouter();
  const href = productHref(slug);

  const warm = useCallback(() => {
    prefetchProductDestination(router, { slug, imageSrc: prefetchImageSrc });
  }, [prefetchImageSrc, router, slug]);

  return (
    <Link
      href={href}
      prefetch
      scroll={false}
      transitionTypes={[PRODUCT_OPEN_TRANSITION]}
      onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
        warm();
        onMouseEnter?.(event);
      }}
      onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
        warm();
        onFocus?.(event);
      }}
      onTouchStart={(event: TouchEvent<HTMLAnchorElement>) => {
        warm();
        onTouchStart?.(event);
      }}
      onNavigate={(event) => {
        prepareProductDestinationScroll();
        onNavigate?.(event);
      }}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        prepareProductDestinationScroll();
        warm();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </Link>
  );
}
