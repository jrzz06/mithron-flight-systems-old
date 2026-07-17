import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { estimateReadingTimeMinutes, normalizeBlogSlug } from "@/services/blog-posts";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("blog system wiring", () => {
  it("defines blog_posts migration with RLS and published listing index", () => {
    const migration = source("supabase/migrations/20260715000100_blog_posts.sql");
    expect(migration).toContain("create table if not exists public.blog_posts");
    expect(migration).toContain("related_product_slugs");
    expect(migration).toContain("blog_posts_published_idx");
    expect(migration).toContain("blog_posts public published read");
    expect(migration).toContain("has_cms_permission('cms.write')");
    expect(migration).toContain("status = 'published'");
  });

  it("exposes blog post service CRUD and published listing helpers", () => {
    const service = source("services/blog-posts.ts");
    expect(service).toContain("listAdminBlogPosts");
    expect(service).toContain("getBlogPostById");
    expect(service).toContain("getBlogPostBySlug");
    expect(service).toContain("listPublishedBlogPosts");
    expect(service).toContain("publishDueScheduledBlogPosts");
    expect(service).toContain("createBlogPost");
    expect(service).toContain("updateBlogPost");
    expect(service).toContain("publishBlogPost");
    expect(service).toContain("unpublishBlogPost");
    expect(service).toContain("archiveBlogPost");
    expect(service).toContain("deleteBlogPost");
    expect(service).toContain('status=eq.published');
    expect(service).toContain("published_at.lte.");
    expect(service).toContain("order=published_at.desc");
    expect(service).toContain('tags: ["blog"]');
    expect(service).toContain("cache(async (slug:");
    expect(service).toMatch(/tags:\s*\["blog",\s*`blog:\$\{normalized\}`\]/);
  });

  it("normalizes slugs and estimates reading time", () => {
    expect(normalizeBlogSlug("Hello World!")).toBe("hello-world");
    expect(normalizeBlogSlug("", "Precision Farming 101")).toBe("precision-farming-101");
    expect(estimateReadingTimeMinutes("word ".repeat(400))).toBe(2);
    expect(estimateReadingTimeMinutes("")).toBe(1);
  });

  it("wires admin articles module, nav, and cms access", () => {
    const nav = source("components/platform/nav-config.ts");
    const access = source("lib/auth/access-control.ts");
    const page = source("app/admin/blog/page.tsx");
    const actions = source("app/admin/blog/actions.ts");

    expect(nav).toContain('href: "/admin/blog"');
    expect(nav).toContain('label: "Articles"');
    expect(nav).not.toContain('label: "In the Press"');
    expect(access).toContain('normalized.startsWith("/admin/blog")');
    expect(page).toContain("Articles");
    expect(page).toContain("ArticleEditorForm");
    expect(page).toContain("listAdminPressCoverage");
    expect(actions).toContain("requireAdminPermission");
    expect(actions).toContain('revalidateTag("press"');
    expect(actions).toContain('revalidateTag("blog"');
    expect(actions).toContain('revalidatePath("/")');
    expect(actions).toContain('revalidatePath("/admin/blog")');
  });

  it("exposes storefront blog listing and article detail routes", () => {
    const list = source("app/(storefront)/blog/page.tsx");
    const detail = source("app/(storefront)/blog/[slug]/page.tsx");
    const card = source("components/blog/blog-article-card.tsx");

    expect(list).toContain("listPublishedBlogPosts");
    expect(list).toContain("BlogArticleCard");
    expect(detail).toContain("getBlogPostBySlug");
    expect(detail).toContain("EditorRenderedContent");
    expect(detail).toContain("related_product_slugs");
    expect(card).toContain("`/blog/${post.slug}`");
    expect(card).toContain('loading="lazy"');
  });

  it("inserts Related Articles after testimonials and prefers Articles CMS press cards", () => {
    const composite = source("sections/home/home-landing-composite.tsx");
    const section = source("sections/home/home-related-articles-section.tsx");
    const bundle = source("services/homepage-bundle.ts");
    const belowHero = source("sections/home/home-below-hero.tsx");
    const homePage = source("app/(storefront)/page.tsx");

    expect(section).toContain('data-testid="home-related-articles"');
    expect(section).toContain("EditorialCoverCard");
    expect(section).toContain('variant="press"');
    expect(section).toContain('variant="blog"');
    expect(section).toContain('variant="custom"');
    expect(section).toContain("pressItems");
    expect(section).toContain("showPressItems");
    expect(section).toContain("visiblePressItems");
    expect(section).not.toContain("pressLinkCards");
    expect(section).toContain("Browse all articles");
    expect(section).toContain('href="/blog"');
    expect(composite).toContain("HomeRelatedArticlesSection");
    expect(composite).toContain("HomeClientTestimonialsSection");
    expect(composite).not.toContain("HomeCustomerTestimonialsSection");
    expect(composite).toContain("customItems={cmsV2.relatedArticles.enabled");
    expect(composite.lastIndexOf("<HomeRelatedArticlesSection")).toBeGreaterThan(
      composite.lastIndexOf("<HomeClientTestimonialsSection")
    );
    expect(composite.indexOf('id="home-about-footer"')).toBeGreaterThan(
      composite.lastIndexOf("<HomeRelatedArticlesSection")
    );
    expect(bundle).toContain("listPublishedBlogPosts({ limit: 3 })");
    expect(bundle).toContain("listPublishedPressCoverage({ limit: 3 })");
    expect(bundle).toContain("relatedArticles");
    expect(bundle).toContain("pressCoverage");
    expect(bundle).toContain("listFeaturedHomeReviews");
    expect(belowHero).toContain("relatedArticles={relatedArticles}");
    expect(belowHero).toContain("pressCoverage={pressCoverage}");
    expect(homePage).toContain("relatedArticles={bundle.relatedArticles}");
    expect(homePage).toContain("pressCoverage={bundle.pressCoverage}");
  });

  it("uses premium editorial cover cards with a single responsive row on the homepage", () => {
    const card = source("components/editorial/editorial-cover-card.tsx");
    const cardStyles = source("components/editorial/editorial-cover-card.module.css");
    const sectionStyles = source("sections/home/home-related-articles-section.module.css");

    expect(card).toContain("post.category");
    expect(card).toContain('variant: "blog"');
    expect(card).toContain('variant: "press"');
    expect(card).toContain('target="_blank"');
    expect(card).toContain('rel="noopener noreferrer"');
    expect(card).toContain("MithronCardImage");
    expect(cardStyles).toContain("aspect-ratio: 16 / 10");
    expect(cardStyles).toContain("prefers-reduced-motion");
    expect(sectionStyles).toContain("scroll-snap-type: x mandatory");
    expect(sectionStyles).toContain("grid-template-columns: repeat(3");
    expect(sectionStyles).toMatch(/@media \(max-width: 1023px\)[\s\S]*?\.gallery[\s\S]*?flex-wrap:\s*nowrap/);
  });

  it("removes News/Blogs/Press from live footer and footer-links config", () => {
    const footer = source("components/layout/site-footer.tsx");
    const links = source("config/footer-links.ts");

    expect(footer).not.toContain("News / Blogs / Press");
    expect(footer).toContain("lg:grid-cols-4");
    expect(footer).not.toContain("lg:grid-cols-5");
    expect(links).not.toContain('title: "Blogs"');
    expect(links).toContain('title: "Social media"');
  });
});
