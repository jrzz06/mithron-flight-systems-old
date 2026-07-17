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
      break;
    }
    case "product-shelf": {
      errors.push(...validateRequired(String(data.title ?? ""), "title", "Shelf title"));
      const slugs = Array.isArray(data.productSlugs) ? data.productSlugs : [];
      if (!slugs.length) {
        errors.push({ field: "productSlugs", message: "Pick at least one product for this shelf." });
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
      break;
    }
    case "related-articles": {
      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length !== 3) {
        errors.push({ field: "items", message: "Configure all three related article cards." });
      }
      for (const [index, item] of items.entries()) {
        const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
        errors.push(...validateRequired(String(row.title ?? ""), `items.${index}.title`, `Article ${index + 1} title`));
        errors.push(...validateRequired(String(row.imageSrc ?? ""), `items.${index}.imageSrc`, `Article ${index + 1} image`));
        errors.push(...validateRequired(String(row.href ?? ""), `items.${index}.href`, `Article ${index + 1} link`));
        if (String(row.href ?? "").trim() && !isValidCmsLink(String(row.href))) {
          errors.push({ field: `items.${index}.href`, message: `Article ${index + 1} link must start with /, #, http://, or https://.` });
        }
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
