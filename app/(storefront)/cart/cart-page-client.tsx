"use client";

import Link from "next/link";
import { CartLineItem } from "@/components/cart/cart-line-item";
import { CartOrderSummary } from "@/components/cart/cart-order-summary";
import { Button } from "@/components/ui/button";
import { removeCartLine, setCartLineQuantity } from "@/lib/cart/cart-actions";
import { useResolvedCart } from "@/hooks/use-resolved-cart";
import { useCartSessionReady, useCartStore } from "@/store/cart";
import { cartLineKey } from "@/lib/cart-line-key";
import styles from "./cart-page.module.css";

const EMPTY_PENDING_LINE_MUTATIONS: Record<string, boolean> = Object.freeze({});

export function CartPageClient() {
  const isCartSessionReady = useCartSessionReady();
  const pendingLineMutations = useCartStore(
    (state) => state.pendingLineMutations ?? EMPTY_PENDING_LINE_MUTATIONS
  );
  const {
    items,
    itemCount,
    subtotal,
    grandTotal,
    isResolving,
    pricesPending,
    error,
    refreshPricing
  } = useResolvedCart({ enabled: isCartSessionReady });
  const showPendingPrices = isResolving || pricesPending;

  if (!isCartSessionReady) {
    return (
      <main className={styles.page}>
        <section className={styles.container}>
          <h1 className={styles.title}>Cart</h1>
          <p className={styles.muted}>Loading cart…</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Cart</h1>
          <p className={styles.muted}>{itemCount} item{itemCount === 1 ? "" : "s"}</p>
        </div>

        {error ? (
          <p className={styles.error}>
            {error}{" "}
            <button type="button" className={styles.retry} onClick={() => void refreshPricing()}>
              Retry
            </button>
          </p>
        ) : null}

        {items.length ? (
          <div className={styles.layout}>
            <div className={styles.lines}>
              {items.map((item) => (
                <CartLineItem
                  key={`${item.productSlug}-${item.bundleId}-${item.variantId ?? ""}`}
                  item={item}
                  showPendingPrices={showPendingPrices}
                  disabled={Boolean(pendingLineMutations[cartLineKey(item)])}
                  onDecrease={() => void setCartLineQuantity(item, item.quantity - 1)}
                  onIncrease={() => void setCartLineQuantity(item, item.quantity + 1)}
                  onRemove={() => void removeCartLine(item)}
                />
              ))}
            </div>
            <CartOrderSummary
              itemCount={itemCount}
              subtotal={subtotal}
              grandTotal={grandTotal}
              showPendingPrices={showPendingPrices}
              checkoutDisabled={!items.length}
            />
          </div>
        ) : (
          <div className={styles.empty}>
            <div className={styles.emptyIllustration} aria-hidden="true" />
            <h2 className={styles.emptyTitle}>Your cart is empty</h2>
            <p className={styles.muted}>Browse products and add items to your cart.</p>
            <Button asChild variant="accent">
              <Link href="/">Continue Shopping</Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
