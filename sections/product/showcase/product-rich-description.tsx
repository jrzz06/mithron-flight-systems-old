import { EditorRenderedContent } from "@/components/editor/editor-rendered-content";
import styles from "./product-showcase.module.css";

export function ProductRichDescription({ html }: { html: string }) {
  return <EditorRenderedContent html={html} />;
}

export function ProductRichDescriptionSection({ html }: { html: string | null }) {
  if (!html?.trim()) return null;

  return (
    <section className={styles.descriptionSection} aria-labelledby="product-description-title">
      <div className={styles.descriptionInner}>
        <div className={styles.descriptionBody}>
          <h2 id="product-description-title" className={styles.descriptionHeading}>
            Description
          </h2>
          <ProductRichDescription html={html} />
        </div>
      </div>
    </section>
  );
}
