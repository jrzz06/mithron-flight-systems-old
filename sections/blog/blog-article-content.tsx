import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { EditorRenderedContent } from "@/components/editor/editor-rendered-content";
import type { Product } from "@/config/types";
import type { BlogPost } from "@/services/blog-posts";
import styles from "@/sections/blog/blog-pages.module.css";

function formatPublishedDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

export function BlogArticleContent({
  post,
  products,
  showDraftBanner = false
}: {
  post: BlogPost;
  products: Product[];
  showDraftBanner?: boolean;
}) {
  const dateLabel = formatPublishedDate(post.published_at);

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        {showDraftBanner ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Draft preview — not visible on the live storefront.
          </div>
        ) : null}
        <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="size-3.5" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Home</span>
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
          <Link href="/blog" className="hover:text-slate-900 transition-colors">
            Blog
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
          <span className="max-w-[16rem] truncate font-medium text-slate-950" aria-current="page">
            {post.title}
          </span>
        </nav>

        <header className={styles.articleHeader}>
          <div className={styles.articleMeta}>
            {dateLabel ? <span>{dateLabel}</span> : null}
            {dateLabel ? <span aria-hidden="true">·</span> : null}
            <span>{post.author}</span>
            <span aria-hidden="true">·</span>
            <span>{post.reading_time_minutes} min read</span>
            {post.category ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{post.category}</span>
              </>
            ) : null}
          </div>
          <h1 className={styles.articleTitle}>{post.title}</h1>
          {post.excerpt ? <p className={styles.articleExcerpt}>{post.excerpt}</p> : null}
        </header>

        {post.cover_image.url ? (
          <div className={styles.hero}>
            <Image
              src={post.cover_image.url}
              alt={post.cover_image.alt || post.title}
              fill
              priority
              sizes="(max-width: 1200px) 100vw, 1100px"
              className={styles.heroImage}
            />
          </div>
        ) : null}

        <article className={styles.content}>
          <EditorRenderedContent html={post.body} />
        </article>

        {products.length ? (
          <section className={styles.related} aria-labelledby="related-products-heading">
            <h2 id="related-products-heading" className={styles.relatedTitle}>
              Related products
            </h2>
            <div className={styles.relatedList}>
              {products.map((product) => (
                <Link key={product.slug} href={`/product/${product.slug}`} className={styles.relatedLink}>
                  {product.name}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
