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
import { useNavPanelStore } from "@/store/nav-panel";
import drawerStyles from "./cart-drawer.module.css";
import popoverStyles from "./cart-popover.module.css";

const CONFIRMATION_AUTO_CLOSE_MS = 3500;
const EMPTY_PENDING_LINE_MUTATIONS: Record<string, boolean> = Object.freeze({});

export function CartPopover({
  open,
  anchor,
  onPointerEnterPanel,
  onPointerLeavePanel
}: {
  open: boolean;
  anchor: { top: number; right: number };
  onPointerEnterPanel?: () => void;
  onPointerLeavePanel?: () => void;
}) {
  const router = useRouter();
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userInteractedRef = useRef(false);
  const [isAnimatingOpen, setIsAnimatingOpen] = useState(false);

  const isCartSessionReady = useCartSessionReady();
  const cartDrawerMode = useCartStore((state) => state.cartDrawerMode);
  const lastAddedLineKey = useCartStore((state) => state.lastAddedLineKey);
  const pendingLineMutations = useCartStore(
    (state) => state.pendingLineMutations ?? EMPTY_PENDING_LINE_MUTATIONS
  );
  const closePanel = useNavPanelStore((s) => s.closePanel);

  const { items, error, refreshPricing } = useResolvedCart({
    enabled: open && isCartSessionReady
  });

  const isVisible = open && isAnimatingOpen;
  const tabIndex = isVisible ? 0 : -1;
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
    closePanel();
  }, [clearAutoCloseTimer, closePanel]);

  const goToCart = useCallback(() => {
    closeDrawer();
    router.push("/cart");
  }, [closeDrawer, router]);

  const goToCheckout = useCallback(() => {
    closeDrawer();
    router.push("/checkout?flow=cart");
  }, [closeDrawer, router]);

  useEffect(() => {
    if (!open) {
      const frameId = requestAnimationFrame(() => setIsAnimatingOpen(false));
      return () => cancelAnimationFrame(frameId);
    }
    let frameId = 0;
    frameId = requestAnimationFrame(() => {
      frameId = requestAnimationFrame(() => setIsAnimatingOpen(true));
    });
    return () => cancelAnimationFrame(frameId);
  }, [open]);

  useEffect(() => {
    if (!open) {
      userInteractedRef.current = false;
      clearAutoCloseTimer();
      return;
    }
    if (!isConfirmation) return;
    userInteractedRef.current = false;
    clearAutoCloseTimer();
    autoCloseTimerRef.current = setTimeout(() => {
      if (!userInteractedRef.current) closeDrawer();
    }, CONFIRMATION_AUTO_CLOSE_MS);
    return clearAutoCloseTimer;
  }, [open, isConfirmation, lastAddedLineKey, clearAutoCloseTimer, closeDrawer]);

  // Flip if near bottom of viewport
  const maxHeight = typeof window !== "undefined" ? Math.min(520, window.innerHeight - anchor.top - 16) : 520;
  const flipUp = typeof window !== "undefined" && anchor.top + 280 > window.innerHeight;
  const top = flipUp ? Math.max(12, anchor.top - 12 - maxHeight) : anchor.top;

  return (
    <div
      id="storefront-cart-popover"
      role="dialog"
      aria-label="Shopping cart"
      aria-modal={isVisible ? "true" : undefined}
      aria-hidden={!isVisible}
      className={cn(popoverStyles.root, isVisible && popoverStyles.isOpen)}
      style={{ top, right: anchor.right, maxHeight }}
      onPointerEnter={onPointerEnterPanel}
      onPointerLeave={onPointerLeavePanel}
      onPointerDown={markUserInteraction}
    >
      <div className={popoverStyles.bridge} aria-hidden="true" />
      <aside className={cn(drawerStyles.drawerPanel, popoverStyles.panel, isConfirmation && drawerStyles.drawerPanelConfirmation)}>
        <header className={drawerStyles.drawerHeader}>
          <div>
            {isConfirmation ? (
              <>
                <p className={drawerStyles.drawerSuccess}>
                  <Check className={drawerStyles.successIcon} aria-hidden="true" />
                  Added to Cart
                </p>
                <p className={drawerStyles.autoDismissHint}>Closing automatically…</p>
              </>
            ) : (
              <>
                <p className={drawerStyles.drawerEyebrow}>Your cart</p>
                <h2 className={drawerStyles.drawerTitle}>
                  {items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : "Cart is empty"}
                </h2>
              </>
            )}
          </div>
          <button type="button" tabIndex={tabIndex} aria-label="Close cart" className={drawerStyles.closeButton} onClick={closeDrawer}>
            <X className="size-6" aria-hidden="true" />
          </button>
        </header>

        {!isCartSessionReady ? (
          <div className={drawerStyles.emptyBody}>
            <div className={drawerStyles.skeletonLine} />
            <div className={drawerStyles.skeletonLineShort} />
          </div>
        ) : isConfirmation && addedItem ? (
          <div className={drawerStyles.confirmationBody}>
            <div className={drawerStyles.confirmationCard}>
              <div className={cn(drawerStyles.productThumb, drawerStyles.confirmationThumb)}>
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
              <div className={drawerStyles.productCopy}>
                <h3 className={drawerStyles.productName}>{addedItem.productName}</h3>
                <p className={drawerStyles.productConfig}>{addedItem.bundleName}</p>
                <p className={drawerStyles.productQty}>Qty: {addedItem.quantity}</p>
              </div>
            </div>
            <div className={drawerStyles.confirmationActions}>
              <button type="button" className={drawerStyles.secondaryButton} onClick={closeDrawer}>
                Continue Shopping
              </button>
              <button type="button" className={cn(drawerStyles.primaryButton, drawerStyles.ctaButton)} onClick={goToCart}>
                View Cart
              </button>
            </div>
          </div>
        ) : items.length ? (
          <div className={drawerStyles.drawerFilled}>
            <div className={drawerStyles.drawerBody}>
              {error ? (
                <p className={drawerStyles.pricingNotice} role="status">
                  {error}{" "}
                  <button type="button" className={drawerStyles.pricingRetry} onClick={() => void refreshPricing()}>
                    Retry
                  </button>
                </p>
              ) : null}
              <ul className={drawerStyles.itemList} aria-label="Cart items">
                {items.map((item) => (
                  <li key={cartLineKey(item)} className={drawerStyles.itemRow}>
                    <div className={drawerStyles.productThumb}>
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
                    <div className={drawerStyles.productCopy}>
                      <h3 className={drawerStyles.productName}>{item.productName}</h3>
                      <p className={drawerStyles.productConfig}>{item.bundleName}</p>
                      <div className={drawerStyles.productActions}>
                        <div className={drawerStyles.quantityControl} role="group" aria-label={`Quantity for ${item.productName}`}>
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            className={drawerStyles.quantityButton}
                            disabled={Boolean(pendingLineMutations[cartLineKey(item)])}
                            onClick={() => {
                              markUserInteraction();
                              if (pendingLineMutations[cartLineKey(item)]) return;
                              void setCartLineQuantity(item, item.quantity - 1);
                            }}
                          >
                            <Minus className="size-3.5" aria-hidden="true" />
                          </button>
                          <span className={drawerStyles.quantityValue}>{item.quantity}</span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            className={drawerStyles.quantityButton}
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
                          className={drawerStyles.removeButton}
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
            <footer className={drawerStyles.drawerFooter}>
              <button type="button" tabIndex={tabIndex} className={drawerStyles.ctaButton} onClick={goToCheckout}>
                Proceed to Checkout
              </button>
              <button type="button" className={drawerStyles.viewCartLink} onClick={goToCart}>
                View full cart
              </button>
            </footer>
          </div>
        ) : (
          <div className={drawerStyles.emptyBody}>
            <div className={drawerStyles.emptyHero}>
              <ShoppingBag className="mx-auto mb-4 size-12 text-white/30" aria-hidden="true" />
              <p className="type-card-title text-lg">Your cart is empty</p>
              <p className="type-body mt-2 text-sm text-white/50">Browse products and add items to get started.</p>
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

/** @deprecated Prefer CartPopover via CartNavButton — kept for import compatibility. */
export { CartPopover as CartDrawer };
