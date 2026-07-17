import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { MithronCardImage } from "@/components/media/mithron-card-image";
import type { PressCoverageItem } from "@/lib/press/press-coverage-shared";
import type { BlogPost } from "@/services/blog-posts";
import type { CmsRelatedArticle } from "@/config/homepage-cms-v2";
import styles from "./editorial-cover-card.module.css";

const IMAGE_SIZES = "(max-width: 767px) 82vw, (max-width: 1023px) 360px, (max-width: 1319px) 30vw, 390px";

type EditorialCoverCardProps =
  | { variant: "blog"; post: BlogPost; priority?: boolean }
  | { variant: "press"; item: PressCoverageItem; priority?: boolean }
  | { variant: "custom"; item: CmsRelatedArticle; priority?: boolean };

function EditorialCoverCardContent({
  coverSrc,
  coverAlt,
  badge,
  showExternalIcon,
  category,
  title,
  description,
  priority = false
}: {
  coverSrc: string;
  coverAlt: string;
  badge?: string;
  showExternalIcon: boolean;
  category?: string;
  title: string;
  description?: string;
  priority?: boolean;
}) {
  return (
    <div className={styles.media}>
      {coverSrc ? (
        <MithronCardImage
          src={coverSrc}
          alt={coverAlt}
          fill
          priority={priority}
          sizes={IMAGE_SIZES}
          className={styles.image}
          wrapperClassName={styles.mediaFrame}
        />
      ) : (
        <div className={styles.mediaPlaceholder} aria-hidden="true" />
      )}
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.gradient} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />
      {badge ? (
        <span className={styles.badge} aria-hidden="true">
          {badge}
        </span>
      ) : null}
      {showExternalIcon ? (
        <span className={styles.externalBtn} aria-hidden="true">
          <ExternalLink className={styles.externalIcon} />
        </span>
      ) : null}
      <div className={styles.content}>
        {category ? <p className={styles.category}>{category}</p> : null}
        <h3 className={styles.title}>{title}</h3>
        {description ? <p className={styles.description}>{description}</p> : null}
        <span className={styles.cta}>Read Article</span>
      </div>
    </div>
  );
}

export function EditorialCoverCard(props: EditorialCoverCardProps) {
  if (props.variant === "blog") {
    const { post } = props;
    const href = `/blog/${post.slug}`;
    const coverSrc = post.cover_image.url;
    const coverAlt = post.cover_image.alt || post.title;
    const category = post.category.trim();
    const ariaLabel = category ? `${post.title} — ${category}` : post.title;

    return (
      <Link
        href={href}
        className={styles.card}
        data-editorial-cover-card
        data-editorial-cover-card-variant="blog"
        aria-label={ariaLabel}
      >
        <EditorialCoverCardContent
          coverSrc={coverSrc}
          coverAlt={coverAlt}
          showExternalIcon={false}
          category={category || undefined}
          title={post.title}
          priority={props.priority}
        />
      </Link>
    );
  }

  if (props.variant === "custom") {
    const { item } = props;
    const isExternal = /^https?:\/\//i.test(item.href);
    const content = (
      <EditorialCoverCardContent
        coverSrc={item.imageSrc}
        coverAlt={item.imageAlt || item.title}
        showExternalIcon={isExternal}
        category={item.eyebrow || undefined}
        title={item.title}
        description={item.content || undefined}
        priority={props.priority}
      />
    );

    if (isExternal) {
      return (
        <a href={item.href} target="_blank" rel="noopener noreferrer" className={styles.card} data-editorial-cover-card data-editorial-cover-card-variant="custom" aria-label={item.title}>
          {content}
        </a>
      );
    }

    return (
      <Link href={item.href || "#home-related-articles"} className={styles.card} data-editorial-cover-card data-editorial-cover-card-variant="custom" aria-label={item.title}>
        {content}
      </Link>
    );
  }

  const { item } = props;
  const coverSrc = item.cover_image.url;
  const coverAlt = item.cover_image.alt || item.title;
  const ariaLabel = `${item.title} — ${item.publisher}`;
  const isExternal = /^https?:\/\//i.test(item.external_url);
  const cardClassName = styles.card;
  const cardProps = {
    className: cardClassName,
    "data-editorial-cover-card": true,
    "data-editorial-cover-card-variant": "press",
    "aria-label": ariaLabel
  } as const;

  const content = (
    <EditorialCoverCardContent
      coverSrc={coverSrc}
      coverAlt={coverAlt}
      badge={item.publisher}
      showExternalIcon={isExternal}
      title={item.title}
      priority={props.priority}
    />
  );

  if (isExternal) {
    return (
      <a href={item.external_url} target="_blank" rel="noopener noreferrer" {...cardProps}>
        {content}
      </a>
    );
  }

  return (
    <Link href={item.external_url || "#home-related-articles"} {...cardProps}>
      {content}
    </Link>
  );
}
