import { MITHRON_WORDMARK_SRC, resolveBrandMarkSrc } from "@/lib/media/brand-mark";
import { getStorefrontResponsiveAsset } from "@/lib/media/resolve-storefront-src";
import { resolvePublicMediaUrl } from "@/lib/media/storage-provider";

type MithronBrandMarkProps = {
  className?: string;
  priority?: boolean;
};

function resolveBrandMarkDelivery() {
  const asset = getStorefrontResponsiveAsset(MITHRON_WORDMARK_SRC);
  const variants = asset?.variants.webp ?? [];
  if (variants.length === 0) {
    const href = resolveBrandMarkSrc();
    return { href, srcSet: undefined as string | undefined, width: 256, height: 31 };
  }

  const sorted = [...variants].sort((left, right) => left.width - right.width);
  const preferred = sorted.find((variant) => variant.width === 256) ?? sorted[0];
  const srcSet = sorted.map((variant) => `${resolvePublicMediaUrl(variant.src)} ${variant.width}w`).join(", ");

  return {
    href: resolvePublicMediaUrl(preferred.src),
    srcSet,
    width: preferred.width,
    height: preferred.height
  };
}

export function MithronBrandMark({
  className = "mithron-brand-mark relative inline-flex h-[22px] w-auto max-w-[108px] shrink-0 items-center md:h-[26px] md:max-w-[128px]",
  priority = false
}: MithronBrandMarkProps) {
  const delivery = resolveBrandMarkDelivery();

  return (
    <span aria-hidden="true" className={className}>
      <img
        src={delivery.href}
        srcSet={delivery.srcSet}
        sizes="128px"
        alt="Mithron"
        width={delivery.width}
        height={delivery.height}
        className="block h-full w-auto max-w-full object-contain object-left"
        fetchPriority={priority ? "high" : undefined}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
    </span>
  );
}
