"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { MithronThumbImage } from "@/components/media/mithron-thumb-image";
import { Button } from "@/components/ui/button";
import { cartLineKey } from "@/lib/cart-line-key";
import { cn } from "@/lib/utils";
import { removeCartLine, setCartLineQuantity } from "@/lib/cart/cart-actions";
import { useResolvedCart } from "@/hooks/use-resolved-cart";
import { useCartSessionReady, useCartStore } from "@/store/cart";
import styles from "./cart-drawer.module.css";

const CONFIRMATION_AUTO_CLOSE_MS = 3500;
const EMPTY_PENDING_LINE_MUTATIONS: Record<string, boolean> = Object.freeze({});

export function CartDrawer() {
  const router = useRouter();
  const panelRef = useRef<HTMLElement>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userInteractedRef = useRef(false);
  const [isAnimatingOpen, setIsAnimatingOpen] = useState(false);

  const isCartSessionReady = useCartSessionReady();
  const isCartOpen = useCartStore((state) => state.isCartOpen);
  const cartDrawerMode = useCartStore((state) => state.cartDrawerMode);
  const lastAddedLineKey = useCartStore((state) => state.lastAddedLineKey);
  const setCartOpen = useCartStore((state) => state.setCartOpen);
  const pendingLineMutations = useCartStore(
    (state) => state.pendingLineMutations ?? EMPTY_PENDING_LINE_MUTATIONS
  );

  const { items, error, refreshPricing } = useResolvedCart({
    enabled: isCartOpen && isCartSessionReady
  });

  const isVisible = isCartOpen && isAnimatingOpen;
  const drawerTabIndex = isVisible ? 0 : -1;
  const isConfirmation = cartDrawerMode === "confirmation";
  const addedItem = items.find((item) => cartLineKey(item) === lastAddedLineKey) ?? items[items.length - 1];

  const clearAutoCloseTimer = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  }, []);

  const markUserInteraction = useCallback(() => {
    userInteractedRef.current = true;
    clearAutoCloseTimer();
  }, [clearAutoCloseTimer]);

  const closeDrawer = useCallback(() => {
    clearAutoCloseTimer();
    setCartOpen(false);
  }, [clearAutoCloseTimer, setCartOpen]);

  const goToCart = useCallback(() => {
    closeDrawer();
    router.push("/cart");
  }, [closeDrawer, router]);

  const goToCheckout = useCallback(() => {
    closeDrawer();
    router.push("/checkout?flow=cart");
  }, [closeDrawer, router]);

  useEffect(() => {
    if (!isCartOpen) {
      const frameId = requestAnimationFrame(() => setIsAnimatingOpen(false));
      return () => cancelAnimationFrame(frameId);
    }

    let frameId = 0;
    frameId = requestAnimationFrame(() => {
      frameId = requestAnimationFrame(() => {
        setIsAnimatingOpen(true);
      });
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isCartOpen]);

  useEffect(() => {
    if (!isCartOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCartOpen]);

  useEffect(() => {
    if (!isCartOpen) {
      userInteractedRef.current = false;
      clearAutoCloseTimer();
      return;
    }

    if (!isConfirmation) return;

    userInteractedRef.current = false;
    clearAutoCloseTimer();
    autoCloseTimerRef.current = setTimeout(() => {
      if (!userInteractedRef.current) {
        closeDrawer();
      }
    }, CONFIRMATION_AUTO_CLOSE_MS);

    return clearAutoCloseTimer;
  }, [isCartOpen, isConfirmation, lastAddedLineKey, clearAutoCloseTimer, closeDrawer]);

  return (
    <div
      className={cn("cart-drawer-root fixed inset-0 z-[var(--z-overlay-backdrop)]", isVisible && "is-open")}
      data-surface="dark"
      aria-hidden={!isVisible}
      aria-label="Shopping cart"
      aria-modal={isVisible ? "true" : undefined}
      role="dialog"
    >
      <button
        type="button"
        tabIndex={drawerTabIndex}
        className="cart-drawer-backdrop absolute inset-0 bg-black/55"
        aria-label="Close cart"
        onClick={closeDrawer}
      />
      <aside
        ref={panelRef}
        className={cn(
          "cart-drawer-panel",
          styles.drawerPanel,
          "absolute right-0 flex w-full max-w-[440px] flex-col overflow-hidden text-white shadow-[0_20px_60px_rgba(15,23,42,.24)]",
          isConfirmation ? styles.drawerPanelConfirmation : "inset-y-0 h-dvh"
        )}
        onPointerDown={markUserInteraction}
      >
        <header className={styles.drawerHeader}>
          <div>
            {isConfirmation ? (
              <>
                <p className={styles.drawerSuccess}>
                  <Check className={styles.successIcon} aria-hidden="true" />
                  Added to Cart
                </p>
                <p className={styles.autoDismissHint}>Closing automatically…</p>
              </>
            ) : (
              <>
                <p className={styles.drawerEyebrow}>Your cart</p>
                <h2 className={styles.drawerTitle}>
                  {items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : "Cart is empty"}
                </h2>
              </>
            )}
          </div>
          <button
            type="button"
            tabIndex={drawerTabIndex}
            aria-label="Close cart"
            className={styles.closeButton}
            onClick={closeDrawer}
          >
            <X className="size-6" aria-hidden="true" />
          </button>
        </header>

        {!isCartSessionReady ? (
          <div className={styles.emptyBody}>
            <div className={styles.skeletonLine} />
            <div className={styles.skeletonLineShort} />
          </div>
        ) : isConfirmation && addedItem ? (
          <div className={styles.confirmationBody}>
            <div className={styles.confirmationCard}>
              <div className={cn(styles.productThumb, styles.confirmationThumb)}>
                {addedItem.image?.trim() ? (
                  <MithronThumbImage
                    src={addedItem.image}
                    alt={addedItem.productName}
                    fill
                    className="object-contain p-2.5"
                    sizes="112px"
                  />
                ) : null}
              </div>
              <div className={styles.productCopy}>
                <h3 className={styles.productName}>{addedItem.productName}</h3>
                <p className={styles.productConfig}>{addedItem.bundleName}</p>
                <p className={styles.productQty}>Qty: {addedItem.quantity}</p>
              </div>
            </div>
            <div className={styles.confirmationActions}>
              <button type="button" className={styles.secondaryButton} onClick={closeDrawer}>
                Continue Shopping
              </button>
              <button type="button" className={cn(styles.primaryButton, styles.ctaButton)} onClick={goToCart}>
                View Cart
              </button>
            </div>
          </div>
        ) : items.length ? (
          <div className={styles.drawerFilled}>
            <div className={styles.drawerBody}>
              {error ? (
                <p className={styles.pricingNotice} role="status">
                  {error}{" "}
                  <button type="button" className={styles.pricingRetry} onClick={() => void refreshPricing()}>
                    Retry
                  </button>
                </p>
              ) : null}

              <ul className={styles.itemList} aria-label="Cart items">
                {items.map((item) => (
                  <li key={cartLineKey(item)} className={styles.itemRow}>
                    <div className={styles.productThumb}>
                      {item.image?.trim() ? (
                        <MithronThumbImage
                          src={item.image}
                          alt={item.productName}
                          fill
                          className="object-contain p-2.5"
                          sizes="96px"
                        />
                      ) : null}
                    </div>
                    <div className={styles.productCopy}>
                      <h3 className={styles.productName}>{item.productName}</h3>
                      <p className={styles.productConfig}>{item.bundleName}</p>
                      <div className={styles.productActions}>
                        <div className={styles.quantityControl} role="group" aria-label={`Quantity for ${item.productName}`}>
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            className={styles.quantityButton}
                            disabled={Boolean(pendingLineMutations[cartLineKey(item)])}
                            onClick={() => {
                              markUserInteraction();
                              if (pendingLineMutations[cartLineKey(item)]) return;
                              void setCartLineQuantity(item, item.quantity - 1);
                            }}
                          >
                            <Minus className="size-3.5" aria-hidden="true" />
                          </button>
                          <span className={styles.quantityValue}>{item.quantity}</span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            className={styles.quantityButton}
                            disabled={Boolean(pendingLineMutations[cartLineKey(item)])}
                            onClick={() => {
                              markUserInteraction();
                              if (pendingLineMutations[cartLineKey(item)]) return;
                              void setCartLineQuantity(item, item.quantity + 1);
                            }}
                          >
                            <Plus className="size-3.5" aria-hidden="true" />
                          </button>
                        </div>
                        <button
                          type="button"
                          className={styles.removeButton}
                          aria-label={`Remove ${item.productName}`}
                          disabled={Boolean(pendingLineMutations[cartLineKey(item)])}
                          onClick={() => {
                            markUserInteraction();
                            if (pendingLineMutations[cartLineKey(item)]) return;
                            void removeCartLine(item);
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <footer className={styles.drawerFooter}>
              <button type="button" tabIndex={drawerTabIndex} className={styles.ctaButton} onClick={goToCheckout}>
                Proceed to Checkout
              </button>
              <button type="button" className={styles.viewCartLink} onClick={goToCart}>
                View full cart
              </button>
            </footer>
          </div>
        ) : (
          <div className={styles.emptyBody}>
            <div className={styles.emptyHero}>
              <ShoppingBag className="mx-auto mb-4 size-12 text-white/30" aria-hidden="true" />
              <p className="type-card-title text-lg">Your cart is empty</p>
              <p className="type-body mt-2 text-sm text-white/50">
                Browse products and add items to get started.
              </p>
              <Button className="mt-5" onClick={closeDrawer}>
                Continue Shopping
              </Button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
