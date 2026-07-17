import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EditorialCoverCard } from "@/components/editorial/editorial-cover-card";
import type { BlogPost } from "@/services/blog-posts";
import type { PressCoverageItem } from "@/services/press-coverage";
import type { CmsRelatedArticle } from "@/config/homepage-cms-v2";
import { HomeRelatedArticlesGallery } from "@/sections/home/home-related-articles-gallery";
import styles from "./home-related-articles-section.module.css";

export function HomeRelatedArticlesSection({
  posts,
  pressItems,
  customItems = []
}: {
  posts: BlogPost[];
  pressItems: PressCoverageItem[];
  customItems?: CmsRelatedArticle[];
}) {
  // Articles CMS (press_coverage) is the primary layman source.
  const visiblePressItems = pressItems.slice(0, 3);
  const showPressItems = visiblePressItems.length > 0;
  const visibleBlogPosts = posts.slice(0, 3);
  const showBlogPosts = !showPressItems && visibleBlogPosts.length > 0;
  const visibleCustomItems = customItems
    .filter((item) => item.enabled && item.title && item.imageSrc && item.href)
    .slice(0, 3);
  const showCustomItems = !showPressItems && !showBlogPosts && visibleCustomItems.length > 0;

  return (
    <section
      id="home-related-articles"
      className={styles.section}
      data-testid="home-related-articles"
      data-mission-motion="skip"
      aria-labelledby="home-related-articles-title"
    >
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.headerCopy}>
            <h2 id="home-related-articles-title" className={styles.title}>
              Related Articles
            </h2>
            <p className={styles.lead}>
              Explore drone technology, agriculture operations, aerial intelligence, precision farming, maintenance
              guidance, and industry insights from Mithron.
            </p>
          </div>
          {showBlogPosts ? (
            <Link href="/blog" className={styles.link}>
              Browse all articles
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : showPressItems || showCustomItems ? (
            <span className={styles.link} aria-hidden="true">
              Related reading
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          ) : null}
        </div>

        <HomeRelatedArticlesGallery>
          {showPressItems
            ? visiblePressItems.map((item, index) => (
                <div key={item.id} className={styles.galleryItem}>
                  <EditorialCoverCard variant="press" item={item} priority={index < 2} />
                </div>
              ))
            : showBlogPosts
              ? visibleBlogPosts.map((post, index) => (
                  <div key={post.id} className={styles.galleryItem}>
                    <EditorialCoverCard variant="blog" post={post} priority={index < 2} />
                  </div>
                ))
              : visibleCustomItems.map((item, index) => (
                  <div key={item.id} className={styles.galleryItem}>
                    <EditorialCoverCard variant="custom" item={item} priority={index < 2} />
                  </div>
                ))}
        </HomeRelatedArticlesGallery>
      </div>
    </section>
  );
}
