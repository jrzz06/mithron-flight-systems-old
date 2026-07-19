import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EditorialCoverCard } from "@/components/editorial/editorial-cover-card";
import type { BlogPost } from "@/services/blog-posts";
import type { PressCoverageItem } from "@/services/press-coverage";
import type { CmsRelatedArticle, CmsRelatedArticleSelection } from "@/config/homepage-cms-v2";
import { HomeRelatedArticlesGallery } from "@/sections/home/home-related-articles-gallery";
import styles from "./home-related-articles-section.module.css";

type SelectedCard =
  | { kind: "press"; item: PressCoverageItem }
  | { kind: "blog"; post: BlogPost };

function resolveSelectedCards(
  selectedItems: Array<CmsRelatedArticleSelection | null | undefined> | undefined,
  posts: BlogPost[],
  pressItems: PressCoverageItem[]
): SelectedCard[] {
  if (!selectedItems?.some((item) => item?.id)) return [];
  const pressById = new Map(pressItems.map((item) => [item.id, item]));
  const blogById = new Map(posts.map((post) => [post.id, post]));
  const cards: SelectedCard[] = [];
  for (const selection of selectedItems) {
    if (!selection?.id) continue;
    if (selection.source === "press") {
      const item = pressById.get(selection.id);
      if (item) cards.push({ kind: "press", item });
      continue;
    }
    const post = blogById.get(selection.id);
    if (post) cards.push({ kind: "blog", post });
  }
  return cards.slice(0, 3);
}

export function HomeRelatedArticlesSection({
  posts,
  pressItems,
  customItems = [],
  selectedItems,
  sectionTitle,
  sectionLead,
  browseAllHref
}: {
  posts: BlogPost[];
  pressItems: PressCoverageItem[];
  customItems?: CmsRelatedArticle[];
  selectedItems?: Array<CmsRelatedArticleSelection | null>;
  sectionTitle?: string;
  sectionLead?: string;
  browseAllHref?: string;
}) {
  const selectedCards = resolveSelectedCards(selectedItems, posts, pressItems);
  const visibleCustomItems = customItems
    .filter((item) => item.enabled && item.title && item.imageSrc && item.href)
    .slice(0, 3);
  // CMS custom cards win when present (2A). Legacy cascade only when CMS list is empty.
  const useCustom = visibleCustomItems.length > 0;
  const useSelected = !useCustom && selectedCards.length > 0;

  const visiblePressItems = pressItems.slice(0, 3);
  const showPressItems = !useCustom && !useSelected && visiblePressItems.length > 0;
  const visibleBlogPosts = posts.slice(0, 3);
  const showBlogPosts = !useCustom && !useSelected && !showPressItems && visibleBlogPosts.length > 0;
  const showCustomItems = useCustom;

  const hasCards = showCustomItems || useSelected || showPressItems || showBlogPosts;
  if (!hasCards) return null;

  const title = sectionTitle?.trim() || "";
  const lead = sectionLead?.trim() || "";
  const browseHref = browseAllHref?.trim() || "/blog";
  const showBrowseLink = useSelected || showBlogPosts || showCustomItems;

  return (
    <section
      id="home-related-articles"
      className={styles.section}
      data-testid="home-related-articles"
      data-mission-motion="skip"
      aria-labelledby={title ? "home-related-articles-title" : undefined}
      aria-label={title ? undefined : "Related articles"}
    >
      <div className={styles.inner}>
        {title || lead || showBrowseLink ? (
          <div className={styles.header}>
            <div className={styles.headerCopy}>
              {title ? (
                <h2 id="home-related-articles-title" className={styles.title}>
                  {title}
                </h2>
              ) : null}
              {lead ? <p className={styles.lead}>{lead}</p> : null}
            </div>
            {showBrowseLink ? (
              <Link href={browseHref} className={styles.link}>
                Browse all articles
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : showPressItems ? (
              <span className={styles.link} aria-hidden="true">
                Related reading
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            ) : null}
          </div>
        ) : null}

        <HomeRelatedArticlesGallery>
          {showCustomItems
            ? visibleCustomItems.map((item, index) => (
                <div key={item.id} className={styles.galleryItem}>
                  <EditorialCoverCard variant="custom" item={item} priority={index < 2} />
                </div>
              ))
            : useSelected
              ? selectedCards.map((card, index) =>
                  card.kind === "press" ? (
                    <div key={card.item.id} className={styles.galleryItem}>
                      <EditorialCoverCard variant="press" item={card.item} priority={index < 2} />
                    </div>
                  ) : (
                    <div key={card.post.id} className={styles.galleryItem}>
                      <EditorialCoverCard variant="blog" post={card.post} priority={index < 2} />
                    </div>
                  )
                )
              : showPressItems
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
                  : null}
        </HomeRelatedArticlesGallery>
      </div>
    </section>
  );
}
