import { ProductShelfContainer } from "@/components/product/product-shelf-container";
import { EditorRenderedContent } from "@/components/editor/editor-rendered-content";
import { HomeProductShelfCard } from "@/components/product/home-product-shelf-card";
import { MithronShelfHeroImage } from "@/components/media/mithron-shelf-hero-image";
import type { Product } from "@/config/types";
import type { HomeChapter } from "@/lib/home/homepage-resolution";
import { pickShelfProducts, type ProductShelfConfig } from "@/lib/home/shelf-product-resolution";
import { ProductShelfScrollRail } from "@/sections/home/product-shelf-scroll-rail";
import { ProductShelfRightStack } from "@/sections/home/product-shelf-right-stack";
import { SoftErrorBoundary } from "@/components/soft-error-boundary";
import styles from "@/sections/home/home-shelf-shared.module.css";

function shelfNavbarInk(tone: ProductShelfConfig["tone"]): "light" | "dark" {
  if (tone === "world" || tone === "global") return "light";
  return "dark";
}

export function ProductShelfSection({
  chapter,
  config,
  products
}: {
  chapter: HomeChapter;
  config: ProductShelfConfig;
  products: Product[];
}) {
  const shelfProducts = pickShelfProducts(products, config);
  const cardProducts = shelfProducts.slice(0, 4);
  const guideImage = cardProducts[0]?.image ?? null;

  return (
    <article
      id={chapter.id}
      className={`${styles.chapter} ${styles.productShelfSection}`}
      data-home-composite-chapter={chapter.id}
      data-layout-kind={chapter.layoutKind}
      data-testid="home-product-shelf-section"
      data-shelf-id={config.testId}
      data-shelf-tone={config.tone}
    >
      <ProductShelfContainer className={styles.container}>
        <div className={styles.productShelfHeader} data-home-composite-reveal>
          <h2 className={styles.shelfTitle}>{config.title}</h2>
        </div>

        <div className={styles.shelfBoard} data-home-composite-reveal>
          <a
            href={config.heroCtaHref}
            className={styles.productShelfHero}
            data-testid="home-product-shelf-hero"
            data-navbar-ink-surface=""
            data-navbar-ink={shelfNavbarInk(config.tone)}
            {...(/^https?:\/\//i.test(config.heroCtaHref)
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            <span className={styles.shelfHeroBackdrop} aria-hidden="true">
              <MithronShelfHeroImage
                src={chapter.media.src}
                alt={chapter.media.alt}
                fill
                className={styles.shelfHeroContextImage}
              />
            </span>
            <span className={styles.shelfHeroCopy}>
              {(config.heroEyebrow || config.eyebrow) ? (
                <span className={styles.shelfHeroEyebrow}>{config.heroEyebrow || config.eyebrow}</span>
              ) : null}
              <span className={styles.shelfHeroHeading}>{config.title}</span>
              {config.heroBody ? (
                <EditorRenderedContent html={config.heroBody} className={styles.shelfHeroBody} />
              ) : null}
              {config.featureCta ? (
                <span className={styles.shelfHeroCta}>{config.featureCta}</span>
              ) : null}
            </span>
          </a>

          {cardProducts.length > 0 ? (
            <SoftErrorBoundary label="Product shelf">
              <ProductShelfScrollRail
                className={styles.productShelfGrid}
                data-testid="home-product-shelf-grid"
                data-shelf-layout="dji"
                aria-label={`${config.title} product collection`}
              >
                {cardProducts.map((product, productIndex) => (
                  <HomeProductShelfCard
                    key={`${config.id}-${product.slug}`}
                    product={product}
                    layout="dji"
                    priority={productIndex === 0}
                  />
                ))}

                <ProductShelfRightStack
                  guideHref={config.href}
                  viewAllHref={config.href}
                  guideEyebrow={config.guideEyebrow}
                  guideHeadline={config.guideHeadline}
                  viewAllLabel={config.viewAllLabel}
                  sectionTitle={config.title}
                  guideImage={guideImage}
                  priority={cardProducts.length > 0}
                />
              </ProductShelfScrollRail>
            </SoftErrorBoundary>
          ) : null}
        </div>
      </ProductShelfContainer>
    </article>
  );
}
