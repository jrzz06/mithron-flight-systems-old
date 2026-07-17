import { clipProductPreviewText, sanitizeProductPreviewText } from "@/lib/product-preview-text";
import { isSpecLikeBlob } from "@/lib/product-spec-text";

type ProductMarketingInput = {
  name: string;
  category: string;
  tagline?: string | null;
  sourceDescription?: string | null;
};

function inferCategoryTagline(name: string, category: string) {
  const source = `${name} ${category}`.toLowerCase();

  if (/battery|power|mah|charger|charging/.test(source)) return "High-efficiency mission power.";
  if (/propeller|propellers|landing gear|toolkit|tool kit|case|cable|connector|pump|nozzle|festo|motor|frame/.test(source)) {
    return "Mission-ready component hardware.";
  }
  if (/mapping|survey|rtk|gnss|pix4d|mapper|matic|multispectral/.test(source)) return "High-precision mapping workflow.";
  if (/thermal|inspection|surveillance|security|zoom|camera|seeker/.test(source)) return "Professional inspection platform.";
  if (/delivery|flybox|payload/.test(source)) return "Autonomous payload deployment.";
  if (/agri|agriculture|spray|spraying|seed|spreader|farming|farm|liter|litre|\bl\b/.test(source)) {
    return "Precision agriculture field system.";
  }
  if (/video|cinema|creative|4k|aerial/.test(source)) return "Cinematic aerial storytelling.";

  return "Curated hardware for professional field operations.";
}

export function getProductMarketingTagline(input: ProductMarketingInput) {
  const candidates = [input.tagline, input.sourceDescription]
    .map((value) => sanitizeProductPreviewText(value ?? "").trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (isSpecLikeBlob(candidate)) continue;
    return clipProductPreviewText(candidate, 120);
  }

  return inferCategoryTagline(input.name, input.category);
}
