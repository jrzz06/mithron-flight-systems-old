/** Transition type passed to Next.js Link / router for product opens. */
export const PRODUCT_OPEN_TRANSITION = "product-open";

/** Stable View Transition name shared between card media and PDP hero. */
export function productMediaTransitionName(slug: string) {
  return `product-media-${slug}`;
}

export function productHref(slug: string) {
  return `/product/${slug}`;
}

export function isProductPath(pathname: string | null | undefined) {
  return Boolean(pathname?.startsWith("/product/"));
}

/** Instant scroll prep — never animate native scroll into the PDP. */
export function prepareProductDestinationScroll() {
  if (typeof window === "undefined") return;
  try {
    window.history.scrollRestoration = "manual";
  } catch {
    /* ignore */
  }
  const root = document.documentElement;
  root.setAttribute("data-product-nav", "pending");
  root.style.setProperty("scroll-behavior", "auto");
}

/** Force PDP to open at scrollTop = 0 before paint settles. */
export function commitProductDestinationScroll() {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("scroll-behavior", "auto");
  window.scrollTo(0, 0);
  root.scrollTop = 0;
  document.body.scrollTop = 0;
  root.removeAttribute("data-product-nav");
}

export function clearProductNavScrollLock() {
  if (typeof document === "undefined") return;
  document.documentElement.style.removeProperty("scroll-behavior");
  document.documentElement.removeAttribute("data-product-nav");
}

type PrefetchRouter = {
  prefetch: (href: string) => void;
};

const prefetchedRoutes = new Set<string>();
const prefetchedImages = new Set<string>();

/** Prefetch RSC route + critical product image so the hero is ready mid-transition. */
export function prefetchProductDestination(
  router: PrefetchRouter,
  options: { slug: string; imageSrc?: string | null }
) {
  if (typeof window === "undefined") return;
  const href = productHref(options.slug);
  if (!prefetchedRoutes.has(href)) {
    prefetchedRoutes.add(href);
    try {
      router.prefetch(href);
    } catch {
      prefetchedRoutes.delete(href);
    }
  }

  const src = options.imageSrc?.trim();
  if (!src || prefetchedImages.has(src)) return;
  prefetchedImages.add(src);
  const image = new window.Image();
  image.decoding = "async";
  image.src = src;
}
