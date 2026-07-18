import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, Home } from "lucide-react";
import { BlogArticleCard } from "@/components/blog/blog-article-card";
import { listPublishedBlogPosts } from "@/services/blog-posts";
import styles from "@/sections/blog/blog-pages.module.css";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Blog – Mithron",
  description:
    "Insights on drone technology, agriculture, aerial intelligence, precision farming, maintenance, and industry practice from Mithron."
};

function BlogIndexFallback() {
  return <div className="min-h-[60vh] animate-pulse bg-[#eef0f3]" aria-hidden="true" />;
}

async function BlogIndexContent() {
  const posts = await listPublishedBlogPosts({ limit: 24 });

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="size-3.5" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Home</span>
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
          <span className="font-medium text-slate-950" aria-current="page">
            Blog
          </span>
        </nav>

        <header className={styles.header}>
          <p className={styles.eyebrow}>Insights</p>
          <h1 className={styles.title}>Mithron Blog</h1>
          <p className={styles.lead}>
            Drone technology, agriculture operations, aerial intelligence, precision farming, maintenance guidance, and
            industry insights from the Mithron team.
          </p>
        </header>

        {posts.length ? (
          <div className={styles.grid}>
            {posts.map((post) => (
              <BlogArticleCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>Articles will appear here once published from the admin blog workspace.</p>
        )}
      </div>
    </main>
  );
}

export default function BlogIndexPage() {
  return (
    <Suspense fallback={<BlogIndexFallback />}>
      <BlogIndexContent />
    </Suspense>
  );
}
