import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { canAccessCmsDraftPreview } from "@/lib/cms/cms-preview-mode";
import { BlogArticleContent } from "@/sections/blog/blog-article-content";
import { getBlogPostBySlug } from "@/services/blog-posts";
import { getPublishedProductsBySlugs } from "@/services/catalog";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug).catch(() => null);
  if (!post || post.status === "archived" || post.archived_at) {
    return { title: "Article – Mithron" };
  }
  return {
    title: post.seo_title || `${post.title} – Mithron Blog`,
    description: post.meta_description || post.excerpt || undefined,
    openGraph: post.cover_image.url
      ? { images: [{ url: post.cover_image.url, alt: post.cover_image.alt || post.title }] }
      : undefined,
    robots: { index: false, follow: false }
  };
}

export default async function BlogDraftPreviewPage({ params }: PageProps) {
  const { slug } = await params;
  if (!(await canAccessCmsDraftPreview())) {
    redirect(`/login?next=${encodeURIComponent(`/preview/blog/${slug}`)}`);
  }

  const post = await getBlogPostBySlug(slug).catch(() => null);
  if (!post || post.status === "archived" || post.archived_at) {
    notFound();
  }

  const products = post.related_product_slugs.length
    ? await getPublishedProductsBySlugs(post.related_product_slugs)
    : [];

  return (
    <BlogArticleContent
      post={post}
      products={products}
      showDraftBanner={post.status !== "published"}
    />
  );
}
