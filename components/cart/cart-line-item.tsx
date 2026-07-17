"use client";

import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { MithronThumbImage } from "@/components/media/mithron-thumb-image";
import type { CartItem } from "@/config/types";
import { formatINR } from "@/lib/utils";
import styles from "./cart-line-item.module.css";

type CartLineItemProps = {
  item: CartItem;
  showPendingPrices: boolean;
  disabled?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
};

export function CartLineItem({
  item,
  showPendingPrices,
  disabled = false,
  onDecrease,
  onIncrease,
  onRemove
}: CartLineItemProps) {
  const variantLabel = item.availabilityLabel ?? item.bundleName;

  return (
    <article className={styles.row}>
      <Link href={`/product/${item.productSlug}`} className={styles.imageLink}>
        {item.image ? (
          <MithronThumbImage
            src={item.image}
            alt=""
            fill={false}
            width={120}
            height={120}
            sizes="120px"
            className={styles.image}
          />
        ) : (
          <span className={styles.imagePlaceholder} aria-hidden="true" />
        )}
      </Link>

      <div className={styles.body}>
        <div className={styles.header}>
          <div>
            <Link href={`/product/${item.productSlug}`} className={styles.name}>
              {item.productName}
            </Link>
            <p className={styles.meta}>{variantLabel}</p>
            {item.sku ? <p className={styles.sku}>SKU: {item.sku}</p> : null}
          </div>
          <button
            type="button"
            className={styles.removeButton}
            aria-label={`Remove ${item.productName}`}
            disabled={disabled}
            onClick={onRemove}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className={styles.footer}>
          <div className={styles.qtyControls} role="group" aria-label={`Quantity for ${item.productName}`}>
            <button type="button" className={styles.qtyButton} aria-label="Decrease quantity" disabled={disabled} onClick={onDecrease}>
              <Minus className="size-3.5" aria-hidden="true" />
            </button>
            <span className={styles.qtyValue}>{item.quantity}</span>
            <button type="button" className={styles.qtyButton} aria-label="Increase quantity" disabled={disabled} onClick={onIncrease}>
              <Plus className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className={styles.pricing}>
            <p className={styles.unitPrice}>
              {showPendingPrices ? "…" : formatINR(item.unitPrice)} each
            </p>
            <p className={styles.lineTotal}>
              {showPendingPrices ? "…" : formatINR(item.unitPrice * item.quantity)}
            </p>
          </div>
        </div>

        <p className={styles.stock}>In stock</p>
      </div>
    </article>
  );
}
