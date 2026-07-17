import { EditorRenderedContent } from "@/components/editor/editor-rendered-content";
import styles from "./product-showcase.module.css";

export function ProductRichDescription({ html }: { html: string }) {
  return <EditorRenderedContent html={html} className={styles.productDescriptionContent} />;
}

export function ProductRichDescriptionSection({ html }: { html: string | null }) {
  if (!html?.trim()) return null;

  return (
    <section className={styles.descriptionSection} aria-label="Product description">
      <div className={styles.descriptionInner}>
        <ProductRichDescription html={html} />
      </div>
    </section>
  );
}
