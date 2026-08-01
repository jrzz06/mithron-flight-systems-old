"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { CartItem, PersistedCartItem } from "@/config/types";
import { QuantityStepper } from "@/components/checkout/quantity-stepper";
import { MithronThumbImage } from "@/components/media/mithron-thumb-image";
import { cn, formatINR } from "@/lib/utils";
import { setCartLineQuantity } from "@/lib/cart/cart-actions";
import type { CheckoutFlow } from "@/hooks/use-checkout-flow";
import { useResolvedCart } from "@/hooks/use-resolved-cart";
import { useBuyNowStore } from "@/store/buy-now-session";
import styles from "@/app/(storefront)/checkout/checkout.module.css";

type CheckoutOrderSummaryProps = {
  promoCode?: string;
  checkoutBusy?: boolean;
  className?: string;
  checkoutFormId?: string;
  itemsOverride?: PersistedCartItem[];
  checkoutMode?: CheckoutFlow;
};

const CheckoutSummaryLineItem = memo(function CheckoutSummaryLineItem({
  item,
  onQuantityChange,
  quantityBusy
}: {
  item: CartItem;
  onQuantityChange: (productSlug: string, bundleId: string, quantity: number) => void;
  quantityBusy?: boolean;
}) {
  return (
    <article className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
        <MithronThumbImage src={item.image} alt={item.productName} fill className="object-contain p-2" sizes="64px" />
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-semibold text-slate-900">{item.productName}</h4>
        <p className="mt-0.5 truncate text-xs text-slate-600">{item.bundleName}</p>
        <div className="mt-2">
          <QuantityStepper
            value={item.quantity}
            label={item.productName}
            loading={quantityBusy}
            onChange={(next) => onQuantityChange(item.productSlug, item.bundleId, next)}
          />
        </div>
      </div>
    </article>
  );
});

function formatRoundingOff(value: number) {
  if (value === 0) return formatINR(0);
  const prefix = value > 0 ? "+" : "−";
  return `${prefix}${formatINR(Math.abs(value))}`;
}

function SummaryPanel({
  items,
  itemsTotal,
  gstSgstTotal,
  roundingOff,
  finalAmount,
  hasPromoCode,
  promoCode,
  onQuantityChange,
  quantityBusy,
  showPendingPrices
}: {
  items: CartItem[];
  itemsTotal: number;
  gstSgstTotal: number;
  roundingOff: number;
  finalAmount: number;
  hasPromoCode: boolean;
  promoCode?: string;
  onQuantityChange: (productSlug: string, bundleId: string, quantity: number) => void;
  quantityBusy?: boolean;
  showPendingPrices?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <section aria-labelledby="checkout-products">
        <h3 id="checkout-products" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Items
        </h3>
        <div className="mt-3 max-h-[min(40vh,360px)] space-y-2 overflow-y-auto pr-0.5">
          {items.map((item) => (
            <CheckoutSummaryLineItem
              key={`${item.productSlug}-${item.bundleId}`}
              item={item}
              onQuantityChange={onQuantityChange}
              quantityBusy={quantityBusy}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="checkout-pricing" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 id="checkout-pricing" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Summary
        </h3>
        <div className="mt-3 grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3 text-slate-700">
            <span>Items total</span>
            <strong className="tabular-nums text-slate-900">
              {showPendingPrices ? "…" : formatINR(itemsTotal)}
            </strong>
          </div>
          <div className="flex items-center justify-between gap-3 text-slate-700">
            <span>GST (CGST + SGST)</span>
            <strong className="tabular-nums text-slate-900">
              {showPendingPrices ? "…" : formatINR(gstSgstTotal)}
            </strong>
          </div>
          <div className="flex items-center justify-between gap-3 text-slate-700">
            <span>Rounding Off</span>
            <strong className="tabular-nums text-slate-900">
              {showPendingPrices ? "…" : formatRoundingOff(roundingOff)}
            </strong>
          </div>
          {hasPromoCode ? (
            <div className="flex items-center justify-between gap-3 text-slate-700">
              <span>Discount</span>
              <strong className="text-slate-900">{promoCode?.trim()}</strong>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3 text-base">
            <span className="font-semibold text-slate-900">Final amount</span>
            <strong className="text-xl font-bold tabular-nums text-slate-900">
              {showPendingPrices ? "…" : formatINR(finalAmount)}
            </strong>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryShell({
  children,
  itemCount,
  total,
  className
}: {
  children: ReactNode;
  itemCount: number;
  total: number;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[var(--elevation-card-rest)] lg:sticky lg:top-24 lg:p-7",
        className
      )}
    >
      <header className="border-b border-slate-200 pb-5">
        <p className={styles.eyebrow}>Order summary</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Review your order</h2>
          <p className="text-sm text-slate-500">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </p>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{formatINR(total)}</p>
      </header>
      <div className="mt-5">{children}</div>
    </aside>
  );
}

export function CheckoutOrderSummary({
  promoCode,
  checkoutBusy = false,
  className,
  checkoutFormId: _checkoutFormId = "checkout-form",
  itemsOverride,
  checkoutMode = "cart"
}: CheckoutOrderSummaryProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const updateBuyNowQuantity = useBuyNowStore((state) => state.updateBuyNowQuantity);
  const {
    items,
    subtotal: itemsTotal,
    gstSgstTotal,
    roundingOff,
    grandTotal: finalAmount,
    itemCount,
    isResolving,
    pricesPending,
    pricingChanged,
    clearPricingChanged
  } = useResolvedCart({ itemsOverride });

  const hasPromoCode = Boolean(promoCode?.trim());
  const isBuyNowMode = checkoutMode === "buy-now";

  const handleQuantityChange = useMemo(() => {
    return (productSlug: string, bundleId: string, quantity: number) => {
      const line = items.find((item) => item.productSlug === productSlug && item.bundleId === bundleId);
      if (!line) return;
      if (isBuyNowMode) {
        updateBuyNowQuantity(quantity);
        return;
      }
      void setCartLineQuantity(line, quantity);
    };
  }, [isBuyNowMode, items, updateBuyNowQuantity]);

  useEffect(() => {
    if (pricingChanged) clearPricingChanged();
  }, [pricingChanged, clearPricingChanged]);

  if (!items.length) {
    return (
      <aside
        className={cn(
          "rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[var(--elevation-card-rest)] lg:sticky lg:top-24 lg:p-7",
          className
        )}
      >
        <p className={styles.eyebrow}>Order summary</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {isBuyNowMode ? "Your Buy Now request expired" : "Your cart is empty"}
        </h2>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          {isBuyNowMode ? (
            <>
              Return to the product page and choose Buy Now again.{" "}
              <Link href="/products" className="font-medium text-emerald-700 underline-offset-2 hover:underline">
                Browse products
              </Link>
            </>
          ) : (
            <>
              Add products to your cart before completing checkout.{" "}
              <Link href="/products" className="font-medium text-emerald-700 underline-offset-2 hover:underline">
                Browse products
              </Link>
            </>
          )}
        </p>
      </aside>
    );
  }

  const showPendingPrices = isResolving || pricesPending;

  const panelProps = {
    items,
    itemsTotal,
    gstSgstTotal,
    roundingOff,
    finalAmount,
    hasPromoCode,
    promoCode,
    onQuantityChange: handleQuantityChange,
    quantityBusy: checkoutBusy || isResolving,
    showPendingPrices
  };

  return (
    <>
      <div className="hidden lg:block">
        <SummaryShell itemCount={itemCount} total={finalAmount} className={className}>
          <SummaryPanel {...panelProps} />
        </SummaryShell>
      </div>

      <div className="lg:hidden">
        <section className={cn(styles.mobileSummaryCard, className)}>
          <button
            type="button"
            className={styles.mobileSummaryToggle}
            aria-expanded={mobileExpanded}
            onClick={() => setMobileExpanded((current) => !current)}
          >
            <div className={styles.mobileSummaryLeft}>
              <p className={styles.eyebrow}>Order summary</p>
              <p className={styles.mobileSummaryMeta}>
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </p>
            </div>
            <div className={styles.mobileSummaryRight}>
              <p className={styles.mobileSummaryTotal}>
                {showPendingPrices ? "…" : formatINR(finalAmount)}
              </p>
              <ChevronDown
                className={cn(styles.mobileSummaryChevron, mobileExpanded && styles.mobileSummaryChevronOpen)}
                aria-hidden="true"
              />
            </div>
          </button>
          {mobileExpanded ? (
            <div className={styles.mobileSummaryBody}>
              <SummaryPanel {...panelProps} />
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
