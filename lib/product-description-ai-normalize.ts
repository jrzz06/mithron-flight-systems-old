import {
  descriptionNormalizePlainText,
  isUnstructuredDescription,
  normalizeProductDescriptionHtml
} from "./product-description-normalize.ts";
import { generateGeminiText } from "./gemini-client.ts";

const PRODUCT_NORMALIZE_PROMPT = `Refine this product description into clean structured plain text.
Rules:
- Preserve every fact, value, and specification exactly.
- Do not add marketing language or invent specifications.
- Remove malformed characters, duplicate lines, and broken encoding.
- Use one spec per line as Label: Value.
- Use section headers on their own line ending with a colon (Sensors:, Package Contents:, Warranty:, Notes:).
- Use "- item" lines under list sections.
- Keep intro paragraphs as plain prose when present.
- Return plain text only, no HTML or markdown.`;

const PRODUCT_NORMALIZE_SYSTEM =
  "You edit product catalog descriptions for a drone commerce store. Preserve specifications exactly. Return only the rewritten passage with no preamble.";

export type ProductDescriptionNormalizeResult = {
  html: string | null;
  geminiUsed: boolean;
};

function getGeminiApiKey(env: Record<string, string | undefined> = process.env) {
  return env.GEMINI_API_KEY?.trim() || env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || "";
}

function shouldUseGeminiFallback(env: Record<string, string | undefined> = process.env) {
  return env.PRODUCT_DESCRIPTION_GEMINI_FALLBACK === "1" || env.PRODUCT_DESCRIPTION_GEMINI_FALLBACK === "true";
}

export async function normalizeProductDescriptionWithAiFallback(
  raw: string | null | undefined,
  options?: { useGemini?: boolean; env?: Record<string, string | undefined> }
): Promise<ProductDescriptionNormalizeResult> {
  const env = options?.env ?? process.env;
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { html: null, geminiUsed: false };

  const deterministic = normalizeProductDescriptionHtml(trimmed);
  const deterministicPlain = descriptionNormalizePlainText(deterministic ?? trimmed);
  const stillUnstructured = isUnstructuredDescription(deterministicPlain, deterministic ?? trimmed);

  if (!stillUnstructured) {
    return { html: deterministic, geminiUsed: false };
  }

  const useGemini = options?.useGemini ?? shouldUseGeminiFallback(env);
  if (!useGemini || !getGeminiApiKey(env)) {
    return { html: deterministic, geminiUsed: false };
  }

  try {
    const sourcePlain = descriptionNormalizePlainText(trimmed);
    const rewritten = await generateGeminiText({
      system: PRODUCT_NORMALIZE_SYSTEM,
      prompt: `${PRODUCT_NORMALIZE_PROMPT}\n\nText:\n${sourcePlain}`,
      temperature: 0.2,
      env,
      maxWaitMs: Number(env.GEMINI_BATCH_RATE_LIMIT_MAX_WAIT_MS ?? "180000")
    });
    const geminiHtml = normalizeProductDescriptionHtml(rewritten) ?? normalizeProductDescriptionHtml(trimmed);
    const geminiPlain = descriptionNormalizePlainText(geminiHtml ?? rewritten);

    if (geminiHtml && !isUnstructuredDescription(geminiPlain, geminiHtml)) {
      return { html: geminiHtml, geminiUsed: true };
    }

    if (geminiHtml && isUnstructuredDescription(deterministicPlain, deterministic ?? undefined)) {
      return { html: geminiHtml, geminiUsed: true };
    }
  } catch (error) {
    console.warn("[product-description-ai-normalize] Gemini fallback failed.", error);
  }

  return { html: deterministic, geminiUsed: false };
}

export async function normalizeProductDescriptionForSave(
  raw: string | null | undefined,
  env: Record<string, string | undefined> = process.env
) {
  const result = await normalizeProductDescriptionWithAiFallback(raw, { env });
  return result.html;
}
