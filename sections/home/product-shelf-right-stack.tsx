import { ProductShelfBuyingGuideCard } from "@/sections/home/product-shelf-buying-guide-card";
import { ProductShelfViewAllCompactCard } from "@/sections/home/product-shelf-view-all-compact-card";
import type { MediaAsset } from "@/config/types";
import styles from "@/sections/home/home-shelf-shared.module.css";

export function ProductShelfRightStack({
  guideHref,
  viewAllHref,
  guideEyebrow,
  guideHeadline,
  viewAllLabel,
  sectionTitle,
  guideImage,
  priority = false
}: {
  guideHref: string;
  viewAllHref: string;
  guideEyebrow: string;
  guideHeadline: string;
  viewAllLabel: string;
  sectionTitle: string;
  guideImage: MediaAsset | null;
  priority?: boolean;
}) {
  return (
    <div className={styles.shelfRightStack} data-testid="home-product-shelf-right-stack">
      <ProductShelfBuyingGuideCard
        href={guideHref}
        eyebrow={guideEyebrow}
        headline={guideHeadline}
        image={guideImage}
        priority={priority}
      />
      <ProductShelfViewAllCompactCard href={viewAllHref} label={viewAllLabel} sectionTitle={sectionTitle} />
    </div>
  );
}
