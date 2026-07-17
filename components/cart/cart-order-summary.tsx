"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import styles from "./cart-order-summary.module.css";

type CartOrderSummaryProps = {
  itemCount: number;
  subtotal: number;
  grandTotal: number;
  showPendingPrices: boolean;
  checkoutDisabled?: boolean;
  discountTotal?: number;
};

export function CartOrderSummary({
  itemCount,
  subtotal,
  grandTotal,
  showPendingPrices,
  checkoutDisabled = false,
  discountTotal = 0
}: CartOrderSummaryProps) {
  return (
    <aside className={styles.summary}>
      <h2 className={styles.title}>Order summary</h2>
      <div className={styles.row}>
        <span>Items ({itemCount})</span>
        <strong>{showPendingPrices ? "…" : formatINR(subtotal)}</strong>
      </div>
      <div className={styles.row}>
        <span>Delivery</span>
        <strong>Calculated at checkout</strong>
      </div>
      {discountTotal > 0 ? (
        <div className={styles.row}>
          <span>Discount</span>
          <strong>-{formatINR(discountTotal)}</strong>
        </div>
      ) : null}
      <div className={`${styles.row} ${styles.finalAmount}`}>
        <span>Final amount</span>
        <strong>{showPendingPrices ? "…" : formatINR(grandTotal)}</strong>
      </div>
      <div className={styles.actions}>
        <Button asChild variant="outline" className={styles.button}>
          <Link href="/">Continue Shopping</Link>
        </Button>
        <Button asChild variant="accent" className={styles.button} disabled={checkoutDisabled || showPendingPrices}>
          <Link href="/checkout?flow=cart">Proceed to Checkout</Link>
        </Button>
      </div>
    </aside>
  );
}
