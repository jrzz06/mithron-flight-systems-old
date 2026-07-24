"use client";

import dynamic from "next/dynamic";
import { Minus, Plus } from "@/components/icons/storefront-icons";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { ProductEnquiryProduct } from "@/components/product/product-enquiry-modal";
import { Button } from "@/components/ui/button";
import type { Bundle, MediaAsset, ProductVariant } from "@/config/types";
import { cn, formatINR } from "@/lib/utils";
import { productBadgeCssClass } from "@/lib/product-badge";
import { formatAvailability } from "@/lib/product-spec-text";
import { deriveProductSku } from "@/lib/product-sku";
import { initializeCartSession } from "@/lib/cart/cart-auth-sync";
import { useRegisterProductPurchase } from "@/sections/product/product-purchase-context";
import { useBuyNowStore, waitForBuyNowPersist } from "@/store/buy-now-session";
import { addCartLine } from "@/lib/cart/cart-actions";
import { useCartHasHydrated, useCartSessionReady, useCartStore } from "@/store/cart";
import styles from "./product-detail.module.css";

const ProductEnquiryModal = dynamic(
  () => import("@/components/product/product-enquiry-modal").then((mod) => mod.ProductEnquiryModal),
  { ssr: false }
);

export type ProductConfiguratorModel = {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  badge?: string;
  badgeStyle?: import("@/lib/product-badge").ProductBadgeStyle;
  price: number;
  compareAt?: number;
  chargeTax?: boolean;
  taxGroup?: string;
  taxRate?: number;
  taxIncluded?: boolean;
  image: MediaAsset;
  variants: ProductVariant[];
  bundles: Bundle[];
  productUrl?: string;
};

function isAvailabilityVariant(variants: ProductVariant[]) {
  return variants.length === 1 && variants[0]?.id === "availability";
}

function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className={styles.quantityStepper} role="group" aria-label="Quantity">
      <button
        type="button"
        className={styles.quantityButton}
        aria-label="Decrease quantity"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span className={styles.quantityValue} aria-live="polite" aria-atomic="true">
        {value}
      </span>
      <button
        type="button"
        className={styles.quantityButton}
        aria-label="Increase quantity"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ProductConfigurator({
  product,
  contactDefaults
}: {
  product: ProductConfiguratorModel;
  contactDefaults?: {
    email?: string;
    phone?: string;
    region?: string;
    isGuest?: boolean;
  };
}) {
  const router = useRouter();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [bundleId, setBundleId] = useState(product.bundles[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const selectedBundle = useMemo(
    () => product.bundles.find((bundle) => bundle.id === bundleId) ?? product.bundles[0],
    [bundleId, product.bundles]
  );
  const selectedVariant = product.variants.find((variant) => variant.id === variantId) ?? product.variants[0];
  const startBuyNow = useBuyNowStore((state) => state.startBuyNow);
  const cartHasHydrated = useCartHasHydrated();
  const cartSessionReady = useCartSessionReady();
  const cartReady = cartHasHydrated && cartSessionReady;
  const showVariantPicker = product.variants.length > 1 && !isAvailabilityVariant(product.variants);
  const showBundlePicker = product.bundles.length > 1;
  const displayPrice = product.price;
  const showGstNote = product.chargeTax !== false;
  const gstLabel = product.taxIncluded ? "Incl. GST" : "Excl. GST";
  const showCompareAt = Boolean(product.compareAt && product.compareAt > displayPrice);
  const stockLabel = isAvailabilityVariant(product.variants)
    ? formatAvailability(selectedVariant?.name ?? "In stock")
    : "In stock";
  const buyBoxTagline = product.tagline?.trim() ?? "";
  const productUrl = product.productUrl ?? `/product/${product.slug}`;

  const buildLineItem = useCallback(() => {
    const bundle = selectedBundle;
    if (!bundle) return null;

    return {
      productSlug: product.slug,
      bundleId: bundle.id,
      quantity,
      variantId: showVariantPicker ? selectedVariant?.id : undefined,
      chargeTax: product.chargeTax,
      taxGroup: product.taxGroup,
      taxRate: product.taxRate,
      taxIncluded: product.taxIncluded,
      category: product.category,
      sku: deriveProductSku(product.slug),
      availabilityLabel: isAvailabilityVariant(product.variants) ? selectedVariant?.name : undefined,
      productName: product.name,
      bundleName: bundle.name,
      image: product.image.src
    };
  }, [
    product.category,
    product.chargeTax,
    product.image.src,
    product.name,
    product.slug,
    product.taxGroup,
    product.taxRate,
    product.taxIncluded,
    product.variants,
    quantity,
    selectedBundle,
    selectedVariant?.id,
    selectedVariant?.name,
    showVariantPicker
  ]);

  const handleAddToCart = useCallback(() => {
    const lineItem = buildLineItem();
    if (!lineItem || isAdding || !cartReady) return;

    setIsAdding(true);
    void addCartLine(lineItem, { openMiniCart: true })
      .catch(() => undefined)
      .finally(() => window.setTimeout(() => setIsAdding(false), 150));
  }, [buildLineItem, cartReady, isAdding]);

  const handleOpenEnquiry = useCallback(() => {
    setEnquiryOpen(true);
  }, []);

  const handleBuyNow = useCallback(() => {
    const lineItem = buildLineItem();
    if (!lineItem || isAdding) return;

    setIsAdding(true);
    void (async () => {
      try {
        if (!useCartStore.getState().isCartSessionReady) {
          await initializeCartSession();
        }
        startBuyNow(lineItem);
        await waitForBuyNowPersist();
        router.push("/checkout?flow=buy-now");
      } finally {
        window.setTimeout(() => setIsAdding(false), 400);
      }
    })();
  }, [buildLineItem, isAdding, router, startBuyNow]);

  const enquiryProduct = useMemo((): ProductEnquiryProduct | null => {
    if (!selectedBundle) return null;
    return {
      slug: product.slug,
      name: product.name,
      sku: deriveProductSku(product.slug),
      image: product.image.src,
      productUrl: typeof window !== "undefined" ? `${window.location.origin}${productUrl}` : productUrl,
      quantity
    };
  }, [product.image.src, product.name, product.slug, productUrl, quantity, selectedBundle]);

  useRegisterProductPurchase(
    useMemo(
      () => ({
        addToCart: handleAddToCart,
        buyNow: handleBuyNow,
        openEnquiry: handleOpenEnquiry,
        isAdding
      }),
      [handleAddToCart, handleBuyNow, handleOpenEnquiry, isAdding]
    )
  );

  return (
    <>
      <aside className={cn("product-configurator", styles.buyBox, styles.buyBoxPremium)}>
        <div className={styles.buyBoxInner}>
          <div className={styles.buyBoxMetaRow}>
            {product.category ? (
              <p className={styles.buyBoxCategory}>{product.category}</p>
            ) : null}
            <p className={styles.stockStatus}>
              <span className={styles.stockDot} aria-hidden="true" />
              {stockLabel}
            </p>
          </div>

          <h1 className={styles.productTitlePremium}>
            {product.name}
          </h1>

          {product.badge ? (
            <div className={styles.badgeRow}>
              <span className={cn(styles.featureBadge, productBadgeCssClass(product.badgeStyle ?? "default", "showroom"))}>
                {product.badge}
              </span>
            </div>
          ) : null}

          {buyBoxTagline ? <p className={styles.productSubtitle}>{buyBoxTagline}</p> : null}

          <div className={styles.priceBlock}>
            <p className={styles.priceHero}>
              {formatINR(displayPrice)}
            </p>
            {showGstNote ? <p className={styles.priceGstNote}>{gstLabel}</p> : null}
            {showCompareAt ? (
              <p className={styles.priceComparePremium}>{formatINR(product.compareAt!)}</p>
            ) : null}
          </div>

          {showVariantPicker ? (
            <section className={styles.compactOptions} aria-labelledby="variant-heading">
              <h2 id="variant-heading" className={styles.compactOptionsLabel}>
                Finish
              </h2>
              <div className={styles.compactOptionRow}>
                {product.variants.map((variant) => {
                  const isSelected = variantId === variant.id;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => setVariantId(variant.id)}
                      aria-pressed={isSelected}
                      className={cn(styles.compactOptionChip, isSelected && styles.compactOptionChipSelected)}
                    >
                      <span className={styles.variantSwatch} style={{ background: variant.tone }} />
                      <span>{variant.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {showBundlePicker ? (
            <section className={styles.compactOptions} aria-labelledby="bundle-heading">
              <h2 id="bundle-heading" className={styles.compactOptionsLabel}>
                Options
              </h2>
              <div className={styles.compactOptionStack}>
                {product.bundles.map((bundle) => {
                  const isSelected = bundleId === bundle.id;
                  return (
                    <button
                      key={bundle.id}
                      type="button"
                      onClick={() => setBundleId(bundle.id)}
                      aria-pressed={isSelected}
                      className={cn(styles.compactBundleRow, isSelected && styles.compactBundleRowSelected)}
                    >
                      <span className={styles.compactBundleName}>{bundle.name}</span>
                      <span className={styles.compactBundlePrice}>{formatINR(product.price)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className={styles.quantityRow}>
            <span className={styles.quantityLabel}>Quantity</span>
            <QuantityStepper value={quantity} onChange={setQuantity} />
          </div>

          <div className={styles.purchaseActions} data-product-purchase-actions>
            <Button
              variant="accent"
              size="lg"
              className={styles.purchaseButton}
              disabled={isAdding}
              onClick={handleBuyNow}
            >
              Buy Now
            </Button>
            <Button
              variant="outline"
              size="lg"
              className={styles.purchaseButton}
              disabled={isAdding || !cartReady}
              onClick={handleAddToCart}
            >
              Add to Cart
            </Button>
            <Button
              variant="outline"
              size="lg"
              className={cn(styles.purchaseButton, styles.purchaseEnquiryButton)}
              onClick={handleOpenEnquiry}
            >
              Send Enquiry
            </Button>
          </div>
        </div>
      </aside>

      <ProductEnquiryModal
        open={enquiryOpen}
        product={enquiryProduct}
        onClose={() => setEnquiryOpen(false)}
        defaultEmail={contactDefaults?.email}
        defaultPhone={contactDefaults?.phone}
        defaultRegion={contactDefaults?.region}
        isGuest={contactDefaults?.isGuest ?? true}
      />
    </>
  );
}
