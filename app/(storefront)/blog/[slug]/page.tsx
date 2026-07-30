import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogArticleContent } from "@/sections/blog/blog-article-content";
import { getBlogPostBySlug, listPublishedBlogPosts } from "@/services/blog-posts";
import { getPublishedProductsBySlugs } from "@/services/catalog";

export const revalidate = 300;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  try {
    const posts = await listPublishedBlogPosts({ limit: 48 });
    return posts.map((post) => ({ slug: post.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug).catch(() => null);
  if (!post || !post.is_visible || post.status !== "published" || post.archived_at) {
    return { title: "Article – Mithron" };
  }
  return {
    title: post.seo_title || `${post.title} – Mithron Blog`,
    description: post.meta_description || post.excerpt || undefined,
    openGraph: post.cover_image.url
      ? { images: [{ url: post.cover_image.url, alt: post.cover_image.alt || post.title }] }
      : undefined
  };
}

export default async function BlogArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug).catch(() => null);
  if (!post || !post.is_visible || post.status !== "published" || post.archived_at) {
    notFound();
  }

  const products = post.related_product_slugs.length
    ? await getPublishedProductsBySlugs(post.related_product_slugs)
    : [];

  return <BlogArticleContent post={post} products={products} />;
}
