"use client";

import Image from "next/image";
import { Package } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { orderRadiusControl } from "@/components/admin/orders/order-layout-utils";

type OrderProductThumbnailProps = {
  src: string | null;
  alt?: string;
  size?: "list" | "detail" | "preview";
  className?: string;
  /** When true and `src` is set, clicking opens a clear light-bg image dialog. */
  enlargeOnClick?: boolean;
};

const sizeMap = {
  list: { className: "h-9 w-9", sizes: "36px", icon: 14 },
  detail: { className: "h-24 w-24", sizes: "96px", icon: 28 },
  preview: { className: "h-40 w-40", sizes: "160px", icon: 36 }
} as const;

export function OrderProductThumbnail({
  src,
  alt = "",
  size = "detail",
  className = "",
  enlargeOnClick = false
}: OrderProductThumbnailProps) {
  const [open, setOpen] = useState(false);
  const dimensions = sizeMap[size];

  const thumb = (
    <div
      className={`relative aspect-square shrink-0 overflow-hidden border border-zinc-200/80 bg-[#f4f4f5] ${orderRadiusControl} ${dimensions.className} ${className}`}
      aria-hidden={!alt && !enlargeOnClick}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          className={size === "preview" || size === "detail" ? "object-contain p-1" : "object-cover"}
          sizes={dimensions.sizes}
          loading="lazy"
          unoptimized
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-zinc-400">
          <Package size={dimensions.icon} strokeWidth={1.5} aria-hidden />
        </div>
      )}
    </div>
  );

  if (!enlargeOnClick || !src) {
    return thumb;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${alt || "product"} image`}
        className="shrink-0 rounded-[inherit] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
      >
        {thumb}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className="max-w-[min(92vw,40rem)] border-zinc-200 bg-[#f4f4f5] p-3 sm:p-4"
        >
          <DialogTitle className="sr-only">{alt || "Product image"}</DialogTitle>
          <div className="relative mx-auto aspect-square w-full max-h-[min(78vh,36rem)]">
            <Image
              src={src}
              alt={alt}
              fill
              className="object-contain p-2"
              sizes="(max-width: 640px) 92vw, 40rem"
              unoptimized
              priority
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
