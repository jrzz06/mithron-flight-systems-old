import { EditorRenderedContent } from "@/components/editor/editor-rendered-content";
import {
  PRODUCT_SPECS_ANCHOR_ID,
  prepareProductDescriptionToc,
  type ProductDescriptionTocEntry
} from "@/lib/product-description-toc";
import styles from "./product-showcase.module.css";

export function ProductRichDescription({ html }: { html: string }) {
  return <EditorRenderedContent html={html} className={styles.productDescriptionContent} />;
}

function ProductDescriptionTocNav({
  entries,
  includeSpecs
}: {
  entries: ProductDescriptionTocEntry[];
  includeSpecs: boolean;
}) {
  // Avoid a sparse one-link "Contents" rail — jump link lives in-page headings instead.
  if (!entries.length) return null;

  return (
    <nav className={styles.descriptionToc} aria-label="Product contents">
      <p className={styles.descriptionTocLabel}>Contents</p>
      <ol className={styles.descriptionTocList}>
        {entries.map((entry) => (
          <li key={entry.id} className={styles.descriptionTocItem} data-kind={entry.kind}>
            <a href={`#${entry.id}`} className={styles.descriptionTocLink}>
              {entry.label}
            </a>
          </li>
        ))}
        {includeSpecs ? (
          <li className={styles.descriptionTocItem} data-kind="specs">
            <a href={`#${PRODUCT_SPECS_ANCHOR_ID}`} className={styles.descriptionTocLink}>
              Key specifications
            </a>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}

export function ProductRichDescriptionSection({
  html,
  includeSpecsLink = false
}: {
  html: string | null;
  includeSpecsLink?: boolean;
}) {
  if (!html?.trim()) return null;

  const { html: anchoredHtml, entries } = prepareProductDescriptionToc(html);
  const showToc = entries.length > 0;

  return (
    <section className={styles.descriptionSection} aria-labelledby="product-description-title">
      <div className={showToc ? styles.descriptionLayout : styles.descriptionInner}>
        {showToc ? (
          <ProductDescriptionTocNav entries={entries} includeSpecs={includeSpecsLink} />
        ) : null}
        <div className={styles.descriptionBody}>
          <h2 id="product-description-title" className={styles.descriptionHeading}>
            Description
          </h2>
          <ProductRichDescription html={anchoredHtml} />
        </div>
      </div>
    </section>
  );
}
