import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import type { MediaAsset } from "@/config/types";
import { MithronCardImage } from "@/components/media/mithron-card-image";
import {
  resolveViewAllCardPresentation,
  viewAllCardPresentationStyle
} from "@/lib/view-all-card-presentation";
import styles from "./product-shelf-view-all-card.module.css";

export type ProductShelfViewAllCardProps = {
  href: string;
  label?: string;
  sectionTitle?: string;
  tone: "world" | "care" | "global";
  heroSrc?: string;
  image: MediaAsset | null;
  imageSlug?: string;
  priority?: boolean;
};

export function ProductShelfViewAllCard({
  href,
  label = "View All",
  sectionTitle,
  tone,
  image,
  imageSlug,
  priority = false
}: ProductShelfViewAllCardProps) {
  const ariaLabel = sectionTitle ? `${label} ${sectionTitle}` : label;
  const presentation = resolveViewAllCardPresentation(imageSlug);
  const presentationStyle = viewAllCardPresentationStyle(presentation) as CSSProperties;

  return (
    <Link
      href={href}
      className={styles.viewAllCard}
      data-shelf-tone={tone}
      data-product-slug={imageSlug}
      data-testid="home-product-view-all-card"
      aria-label={ariaLabel}
      style={presentationStyle}
    >
      <div className={styles.viewAllStage}>
        {image ? (
          <div className={styles.viewAllImageFrame} aria-hidden>
            <MithronCardImage
              src={image.src}
              alt=""
              aria-hidden={true}
              fill
              priority={priority}
              responsive={image.responsive}
              sizes="(max-width: 640px) 72vw, 280px"
              className={styles.viewAllImage}
            />
          </div>
        ) : null}
        <span className={styles.viewAllArrow} aria-hidden>
          <ArrowRight size={16} />
        </span>
      </div>
    </Link>
  );
}
