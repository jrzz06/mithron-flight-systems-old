"use client";

import Image from "next/image";
import { Package } from "lucide-react";

import { orderRadiusControl } from "@/components/admin/orders/order-layout-utils";

type OrderProductThumbnailProps = {
  src: string | null;
  alt?: string;
  size?: "list" | "detail";
  className?: string;
};

const sizeMap = {
  list: { className: "h-12 w-12", sizes: "48px", icon: 18 },
  detail: { className: "h-24 w-24", sizes: "96px", icon: 28 }
} as const;

export function OrderProductThumbnail({
  src,
  alt = "",
  size = "detail",
  className = ""
}: OrderProductThumbnailProps) {
  const dimensions = sizeMap[size];

  return (
    <div
      className={`relative aspect-square shrink-0 overflow-hidden border border-[var(--platform-border)] bg-gradient-to-br from-[var(--platform-surface-muted)] to-[var(--platform-surface)] ${orderRadiusControl} ${dimensions.className} ${className}`}
      aria-hidden={!alt}
    >
      {src ? (
        <Image src={src} alt={alt} fill className="object-cover" sizes={dimensions.sizes} loading="lazy" />
      ) : (
        <div className="grid h-full w-full place-items-center text-[var(--platform-text-muted)]">
          <Package size={dimensions.icon} strokeWidth={1.5} aria-hidden />
        </div>
      )}
    </div>
  );
}
