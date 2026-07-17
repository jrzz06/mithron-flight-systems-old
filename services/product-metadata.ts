import type { Metadata } from "next";
import type { MediaAsset, Product } from "@/config/types";

function resolveMetadataImage(asset: MediaAsset | undefined | null) {
  if (!asset?.src) return undefined;
  return {
    url: asset.src,
    alt: asset.alt,
    width: asset.width,
    height: asset.height
  };
}

export function buildProductMetadata(product: Product | null): Metadata {
  if (!product) {
    return {
      title: "Product not found",
      description: "Mithron product unavailable."
    };
  }

  const canonical = product.productUrl ?? `/product/${product.slug}`;
  const title = product.seoTitle ?? `${product.name} - Mithron`;
  const description = product.seoDescription ?? product.tagline;
  const ogTitle = product.ogTitle ?? title;
  const ogDescription = product.ogDescription ?? description;
  const ogImage = resolveMetadataImage(product.ogImage) ?? resolveMetadataImage(product.hero) ?? resolveMetadataImage(product.image);

  return {
    title,
    description,
    alternates: {
      canonical
    },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: canonical,
      images: ogImage ? [ogImage] : undefined
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: ogImage ? [ogImage.url] : undefined
    }
  };
}
