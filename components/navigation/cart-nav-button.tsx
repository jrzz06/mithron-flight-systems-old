"use client";

import { ShoppingBag } from "lucide-react";
import { useCallback } from "react";
import { useCartItemCount, useCartSessionReady, useCartStore } from "@/store/cart";

function preloadCartDrawer() {
  void import("@/components/overlays/cart-drawer").catch(() => undefined);
}

export function CartNavButton() {
  const isReady = useCartSessionReady();
  const count = useCartItemCount();
  const openCartDrawer = useCartStore((state) => state.openCartDrawer);
  const isCartOpen = useCartStore((state) => state.isCartOpen);
  const displayCount = isReady ? count : 0;

  const handleClick = useCallback(() => {
    preloadCartDrawer();
    openCartDrawer("cart");
  }, [openCartDrawer]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Open cart${displayCount ? `, ${displayCount} items` : ""}`}
        aria-expanded={isCartOpen}
        data-testid="nav-cart-button"
        onFocus={preloadCartDrawer}
        onPointerEnter={preloadCartDrawer}
        onClick={handleClick}
        className="adaptive-navbar__icon nav-interactive nav-interactive--subtle relative inline-flex size-11 items-center justify-center rounded-full text-current"
      >
        <ShoppingBag className="size-[18px]" />
        {displayCount > 0 ? (
          <span className="absolute right-0.5 top-0.5 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-[#22d216] px-1 text-[10px] font-bold leading-none text-black">
            {displayCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
