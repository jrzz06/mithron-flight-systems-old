import type { CmsImageSpec } from "@/config/homepage-section-registry";
import type { CmsEditorKind } from "@/config/homepage-section-registry";

export type CmsValidationError = {
  field: string;
  message: string;
};

export type CmsValidationResult = {
  valid: boolean;
  errors: CmsValidationError[];
};

const INTERNAL_LINK = /^(\/|#)/;
const EXTERNAL_LINK = /^https?:\/\//i;

export function isValidCmsLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return INTERNAL_LINK.test(trimmed) || EXTERNAL_LINK.test(trimmed);
}

export function aspectRatioMatches(width: number, height: number, spec: CmsImageSpec, tolerance = 0.02) {
  if (!width || !height) return false;
  const [w, h] = spec.aspectRatio.split(":").map(Number);
  if (!w || !h) return true;
  const expected = w / h;
  const actual = width / height;
  return Math.abs(expected - actual) <= tolerance * expected;
}

export function validateImageDimensions(
  width: number,
  height: number,
  spec: CmsImageSpec
): CmsValidationError[] {
  const errors: CmsValidationError[] = [];

  if (spec.exactDimensions) {
    const tolerance = 2;
    if (
      Math.abs(width - spec.requiredWidth) > tolerance
      || Math.abs(height - spec.requiredHeight) > tolerance
    ) {
      errors.push({
        field: "image",
        message: `Image must be exactly ${spec.requiredWidth}×${spec.requiredHeight}px. Uploaded: ${width}×${height}px.`
      });
    }
    return errors;
  }

  if (width < spec.minWidth || height < spec.minHeight) {
    errors.push({
      field: "image",
      message: `Image must be at least ${spec.minWidth}×${spec.minHeight}px. Uploaded: ${width}×${height}px.`
    });
  }
  if (!aspectRatioMatches(width, height, spec)) {
    errors.push({
      field: "image",
      message: `Image aspect ratio must be ${spec.aspectRatio}. Uploaded: ${width}×${height}px.`
    });
  }
  return errors;
}

export function validateCtaPair(label: string, href: string, fieldPrefix = "cta") {
  const errors: CmsValidationError[] = [];
  if (label.trim() && !href.trim()) {
    errors.push({ field: `${fieldPrefix}Href`, message: "CTA link is required when a button label is set." });
  }
  if (href.trim() && !isValidCmsLink(href)) {
    errors.push({ field: `${fieldPrefix}Href`, message: "Link must start with /, #, http://, or https://." });
  }
  return errors;
}

export function validateRequired(value: string, field: string, label: string) {
  return value.trim() ? [] : [{ field, message: `${label} is required.` }];
}

export function validateSectionForPublish(
  editorKind: CmsEditorKind,
  data: Record<string, unknown>
): CmsValidationResult {
  const errors: CmsValidationError[] = [];

  switch (editorKind) {
    case "hero-carousel": {
      errors.push(...validateRequired(String(data.title ?? ""), "title", "Title"));
      errors.push(...validateRequired(String(data.imageSrc ?? ""), "imageSrc", "Hero image"));
      errors.push(...validateCtaPair(String(data.ctaLabel ?? ""), String(data.href ?? "")));
      break;
    }
    case "mini-carousel": {
      const slides = Array.isArray(data.slides) ? data.slides : [];
      if (!slides.some((slide) => slide && typeof slide === "object" && (slide as Record<string, unknown>).enabled !== false)) {
        errors.push({ field: "slides", message: "At least one enabled slide is required." });
      }
      const orphanedSlugs = data.orphanedSlugs instanceof Set ? data.orphanedSlugs : new Set<string>();
      if (orphanedSlugs.size > 0) {
        errors.push({
          field: "slides",
          message: `${orphanedSlugs.size} carousel slot${orphanedSlugs.size > 1 ? "s" : ""} reference ${orphanedSlugs.size > 1 ? "products" : "a product"} missing from the live catalog. Replace before publishing.`
        });
      }
      break;
    }
    case "product-shelf": {
      errors.push(...validateRequired(String(data.title ?? ""), "title", "Shelf title"));
      const slugs = Array.isArray(data.productSlugs)
        ? data.productSlugs.filter((slug) => typeof slug === "string" && slug.trim())
        : [];
      if (slugs.length !== 4) {
        errors.push({
          field: "productSlugs",
          message: `Shelf requires exactly 4 product slots. Selected: ${slugs.length}.`
        });
      }
      // Guard: block publish if any explicitly-assigned slug cannot be found in the live catalog.
      const orphanedSlugs = data.orphanedSlugs instanceof Set ? data.orphanedSlugs : new Set<string>();
      const orphaned = slugs.filter((slug) => orphanedSlugs.has(slug));
      if (orphaned.length > 0) {
        errors.push({
          field: "productSlugs",
          message: `${orphaned.length} product slot${orphaned.length > 1 ? "s" : ""} reference ${orphaned.length > 1 ? "products" : "a product"} that no longer exist in the live catalog. Replace before publishing.`
        });
      }
      break;
    }

    case "inter-shelf-banner":
    case "full-viewport-banner": {
      errors.push(...validateRequired(String(data.heading ?? ""), "heading", "Heading"));
      errors.push(...validateRequired(String(data.imageSrc ?? data.desktopImageSrc ?? ""), "imageSrc", "Banner image"));
      errors.push(...validateCtaPair(String(data.ctaLabel ?? ""), String(data.href ?? "")));
      break;
    }
    case "reviews-section": {
      errors.push(...validateRequired(String(data.title ?? ""), "title", "Reviews heading"));
      const cards = Array.isArray(data.cards) ? data.cards : [];
      if (!cards.length) {
        errors.push({ field: "cards", message: "Add at least one testimonial card." });
      }
      for (const [index, item] of cards.entries()) {
        const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        if (row.enabled === false) continue;
        errors.push(...validateRequired(String(row.authorName ?? ""), `cards.${index}.authorName`, `Card ${index + 1} name`));
        errors.push(...validateRequired(String(row.body ?? ""), `cards.${index}.body`, `Card ${index + 1} review text`));
        const body = String(row.body ?? "");
        if (body.length > 200) {
          errors.push({ field: `cards.${index}.body`, message: `Card ${index + 1} review text must be ≤200 characters.` });
        }
        const rating = Number(row.rating);
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
          errors.push({ field: `cards.${index}.rating`, message: `Card ${index + 1} rating must be 1–5.` });
        }
        const productSlug = String(row.productSlug ?? "").trim();
        const hrefOverride = String(row.hrefOverride ?? "").trim();
        if (!productSlug && !hrefOverride) {
          errors.push({
            field: `cards.${index}.link`,
            message: `Card ${index + 1} needs a linked product or a manual link.`
          });
        }
        if (hrefOverride && !isValidCmsLink(hrefOverride)) {
          errors.push({ field: `cards.${index}.hrefOverride`, message: `Card ${index + 1} link is invalid.` });
        }
      }
      break;
    }
    case "related-articles": {
      const items = Array.isArray(data.items) ? data.items : [];
      let completeCount = 0;
      for (const [index, item] of items.entries()) {
        const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        if (row.enabled === false) continue;
        const title = String(row.title ?? "").trim();
        const imageSrc = String(row.imageSrc ?? "").trim();
        const href = String(row.href ?? "").trim();
        // Empty slots stay empty — skip validation until the admin fills them.
        if (!title && !imageSrc && !href) continue;
        completeCount += 1;
        errors.push(...validateRequired(title, `items.${index}.title`, `Article ${index + 1} title`));
        errors.push(...validateRequired(imageSrc, `items.${index}.imageSrc`, `Article ${index + 1} image`));
        errors.push(...validateRequired(href, `items.${index}.href`, `Article ${index + 1} link`));
        if (href && !isValidCmsLink(href)) {
          errors.push({
            field: `items.${index}.href`,
            message: `Article ${index + 1} link must start with /, #, http://, or https://.`
          });
        }
      }
      if (!completeCount) {
        errors.push({ field: "items", message: "Add at least one related article with title, image, and link." });
      }
      break;
    }
    default:
      break;
  }

  return { valid: errors.length === 0, errors };
}

export async function validateImageFile(file: File, spec: CmsImageSpec): Promise<CmsValidationResult> {
  const errors: CmsValidationError[] = [];

  if (!spec.formats.includes(file.type)) {
    errors.push({
      field: "image",
      message: `Format not allowed. Use ${spec.formats.map((f) => f.replace("image/", "").toUpperCase()).join(", ")}.`
    });
    return { valid: false, errors };
  }

  if (file.size > spec.maxSizeMb * 1024 * 1024) {
    errors.push({ field: "image", message: `File exceeds ${spec.maxSizeMb}MB limit.` });
    return { valid: false, errors };
  }

  try {
    const bitmap = await createImageBitmap(file);
    errors.push(...validateImageDimensions(bitmap.width, bitmap.height, spec));
    bitmap.close();
  } catch {
    errors.push({ field: "image", message: "Could not read image dimensions." });
  }

  return { valid: errors.length === 0, errors };
}
