import Image from "next/image";
import Link from "next/link";
import type { BlogPost } from "@/services/blog-posts";
import styles from "./blog-article-card.module.css";

function formatPublishedDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export function BlogArticleCard({ post }: { post: BlogPost }) {
  const href = `/blog/${post.slug}`;
  const dateLabel = formatPublishedDate(post.published_at);
  const coverSrc = post.cover_image.url;
  const coverAlt = post.cover_image.alt || post.title;

  return (
    <Link href={href} className={styles.card} data-blog-article-card>
      <div className={styles.media}>
        {coverSrc ? (
          <Image
            src={coverSrc}
            alt={coverAlt}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className={styles.image}
            loading="lazy"
          />
        ) : (
          <div className={styles.mediaPlaceholder} aria-hidden="true" />
        )}
      </div>
      <div className={styles.body}>
        {dateLabel ? <p className={styles.date}>{dateLabel}</p> : null}
        <h3 className={styles.title}>{post.title}</h3>
        {post.excerpt ? <p className={styles.excerpt}>{post.excerpt}</p> : null}
        <div className={styles.meta}>
          <span>{post.author}</span>
          <span aria-hidden="true">·</span>
          <span>{post.reading_time_minutes} min read</span>
        </div>
      </div>
    </Link>
  );
}
