"use client";

import Image from "next/image";
import Link from "next/link";
import { cn, formatINR } from "@/lib/utils";
import styles from "./mithron-product-mini-card.module.css";

export type MithronProductMiniCardData = {
  slug: string;
  name: string;
  category?: string | null;
  price?: number | null;
  availability?: string | null;
  image?: string | null;
  url?: string | null;
};

export function MithronProductMiniCard({
  data,
  onRequestQuote,
  compact = true
}: {
  data: MithronProductMiniCardData;
  onRequestQuote?: () => void;
  compact?: boolean;
}) {
  const href = data.url?.startsWith("/") ? data.url : `/product/${data.slug}`;
  const price = typeof data.price === "number" ? formatINR(data.price) : "—";
  const stock = data.availability?.trim() ? data.availability.trim() : "—";

  return (
    <div className={cn(styles.card, compact && styles.compact)} data-mithron-product-mini-card>
      <div className={styles.media}>
        {data.image ? (
          <Image src={data.image} alt={data.name} fill sizes="56px" className={styles.image} />
        ) : (
          <div className={styles.placeholder} aria-hidden="true" />
        )}
      </div>
      <div className={styles.body}>
        <p className={styles.name}>{data.name}</p>
        <div className={styles.meta}>
          <span className={styles.price}>{price}</span>
          <span className={styles.dot} aria-hidden="true">·</span>
          <span className={styles.stock}>Stock: {stock}</span>
        </div>
        <div className={styles.actions}>
          <Link href={href} className={styles.link}>
            View product
          </Link>
          <button type="button" className={styles.quote} onClick={onRequestQuote}>
            Request quote
          </button>
        </div>
      </div>
    </div>
  );
}

