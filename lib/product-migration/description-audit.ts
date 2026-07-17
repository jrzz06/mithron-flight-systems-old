import type { WixProductSnapshot } from "../wix/catalog-client.ts";
import { decodeHtml } from "../wix/catalog-normalize.ts";
import { isPollutedSpecEntry } from "../wix/semantic-content-parser.ts";
import { plainTextToDescriptionHtml } from "../product-reconcile/score-canonical.ts";
import { normalizeProductDescriptionHtml } from "../product-description-normalize.ts";
import {
  matchDbRowToWixProduct,
  type CategoryAuditDbRow,
  type WixMatchResult
} from "./category-audit.ts";

export type DescriptionAuditDbRow = CategoryAuditDbRow & {
  story?: unknown[] | null;
};

export type DescriptionCleanupReason =
  | "empty"
  | "migration_artifact"
  | "junk"
  | "very_short"
  | "unformatted_spec_blob"
  | "duplicate_paragraphs"
  | "low_quality";

export type DescriptionResolutionSource = "wix" | "verified_fallback" | "none";

const MIGRATION_ARTIFACT_PATTERNS = [
  /\bimported from (?:live )?wix\b/i,
  /\bimported from wix studio\b/i,
  /\bwix (?:studio )?migrat/i,
  /\b(?:auto-?generated|placeholder copy|placeholder text)\b/i,
  /\blorem ipsum\b/i,
  /\bgettyimages\.com\b/i,
  /\bmigration (?:note|comment|artifact)\b/i,
  /^[a-z0-9-]+ catalog listing\.?$/i,
  /^(?:df|ss|sfafse)$/i
];

const SPEC_TOKEN_PATTERN =
  /(?:UAV Type|UAV Category|Endurance|Range|Maximum|Operating|Wind Resistance|All-Up-Weight|Payload|Battery|Flight Time)/i;

const HIDDEN_SPEC_KEYS = new Set(["Product ID", "Source", "Currency", "Category", "Availability"]);

export function descriptionPlainText(value: string | null | undefined) {
  return decodeHtml(String(value ?? ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isMigrationArtifactText(value: string | null | undefined) {
  const text = descriptionPlainText(value);
  if (!text) return false;
  return MIGRATION_ARTIFACT_PATTERNS.some((pattern) => pattern.test(text));
}

export function isSpecLikeDescriptionBlob(text: string) {
  const clean = descriptionPlainText(text);
  if (!clean) return false;
  const colonMatches = clean.match(/[A-Za-z][A-Za-z0-9\s\-/()]{0,48}:\s*/g) ?? [];
  if (colonMatches.length >= 3) return true;
  if (SPEC_TOKEN_PATTERN.test(clean) && colonMatches.length >= 2) return true;
  return false;
}

export function isJunkDescriptionValue(value: string | null | undefined) {
  if (!value?.trim()) return true;
  const text = descriptionPlainText(value).toLowerCase();
  if (!text) return true;
  if (isMigrationArtifactText(text)) return true;
  if (/gettyimages\.com/.test(text)) return true;
  if (/^(df|ss|sfafse)(\s|$)/.test(text)) return true;
  if (/^[a-z0-9-]+ catalog listing\.?$/.test(text)) return true;
  if (hasStructuredDescriptionHtml(value)) return false;
  return isSpecLikeDescriptionBlob(text);
}

export function hasStructuredDescriptionHtml(value: string | null | undefined) {
  return /<(p|ul|ol|li|h[1-6])\b/i.test(String(value ?? ""));
}

export function descriptionQualityScore(value: string | null | undefined) {
  const html = String(value ?? "");
  const plain = descriptionPlainText(html);
  if (!plain) return 0;

  let score = Math.min(Math.round(plain.length / 3), 45);
  if (hasStructuredDescriptionHtml(html)) score += 20;
  if (plain.length >= 120) score += 10;
  if (plain.length >= 240) score += 5;
  if (isMigrationArtifactText(plain)) score -= 80;
  if (isJunkDescriptionValue(html)) score -= 60;
  if (isSpecLikeDescriptionBlob(plain) && !hasStructuredDescriptionHtml(html)) score -= 25;
  if (plain.length < 50) score -= 35;
  score -= countDuplicateParagraphs(html) * 8;
  return Math.max(0, Math.min(100, score));
}

export function isAcceptableDescription(value: string | null | undefined) {
  const plain = descriptionPlainText(value);
  if (!plain || plain.length < 80) return false;
  if (isMigrationArtifactText(plain) || isJunkDescriptionValue(value)) return false;
  if (isSpecLikeDescriptionBlob(plain) && !hasStructuredDescriptionHtml(value)) return false;
  return descriptionQualityScore(value) >= 55;
}

function countDuplicateParagraphs(html: string) {
  const blocks = [...html.matchAll(/<(p|li|h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi)];
  const seen = new Set<string>();
  let dupes = 0;
  for (const block of blocks) {
    const key = descriptionPlainText(block[2]).toLowerCase();
    if (key.length < 24) continue;
    if (seen.has(key)) dupes += 1;
    else seen.add(key);
  }
  return dupes;
}

export function assessDescriptionCleanup(row: DescriptionAuditDbRow) {
  const reasons: DescriptionCleanupReason[] = [];
  const description = row.description ?? "";

  if (!description.trim()) reasons.push("empty");
  if (isMigrationArtifactText(description)) reasons.push("migration_artifact");
  if (isJunkDescriptionValue(description)) reasons.push("junk");
  if (descriptionPlainText(description).length > 0 && descriptionPlainText(description).length < 60) {
    reasons.push("very_short");
  }
  if (isSpecLikeDescriptionBlob(description) && !hasStructuredDescriptionHtml(description)) {
    reasons.push("unformatted_spec_blob");
  }
  if (countDuplicateParagraphs(description) > 0) reasons.push("duplicate_paragraphs");
  if (!isAcceptableDescription(description)) reasons.push("low_quality");

  const uniqueReasons = [...new Set(reasons)];
  const needsCleanup =
    uniqueReasons.includes("empty")
    || uniqueReasons.includes("migration_artifact")
    || uniqueReasons.includes("junk")
    || uniqueReasons.includes("very_short")
    || uniqueReasons.includes("unformatted_spec_blob")
    || uniqueReasons.includes("duplicate_paragraphs")
    || (uniqueReasons.includes("low_quality") && descriptionQualityScore(description) < 55);

  return { needsCleanup, reasons: uniqueReasons, score: descriptionQualityScore(description) };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function stripMigrationArtifactsFromHtml(html: string) {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  cleaned = cleaned.replace(/<(p|li|div|span)[^>]*>([\s\S]*?)<\/\1>/gi, (full, _tag, inner) => {
    const plain = descriptionPlainText(inner);
    if (!plain) return "";
    if (isMigrationArtifactText(plain)) return "";
    return full;
  });

  return cleaned.replace(/\s+/g, " ").trim();
}

export function dedupeDescriptionHtml(html: string) {
  const seen = new Set<string>();
  return html.replace(/<(p|li|h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, (full, _tag, inner) => {
    const key = descriptionPlainText(inner).toLowerCase();
    if (key.length < 24) return full;
    if (seen.has(key)) return "";
    seen.add(key);
    return full;
  });
}

export function normalizeDescriptionHtml(html: string) {
  const stripped = stripMigrationArtifactsFromHtml(html);
  const deduped = dedupeDescriptionHtml(stripped);
  const normalized = normalizeProductDescriptionHtml(deduped);
  if (normalized) return normalized;
  const plain = descriptionPlainText(deduped);
  if (!plain) return null;
  return plainTextToDescriptionHtml(plain);
}

function htmlFromPlainCandidate(value: string) {
  const trimmed = decodeHtml(value).trim();
  if (!trimmed) return null;
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return normalizeDescriptionHtml(trimmed);
  return plainTextToDescriptionHtml(trimmed);
}

export function resolveWixDescription(wix: WixProductSnapshot) {
  const rich = wix.rich;
  const candidates: Array<{ value: string; source: string }> = [];

  if (rich.description_html.trim()) {
    candidates.push({ value: rich.description_html, source: "wix.description_html" });
  }
  if (rich.semantic?.overview_html?.trim()) {
    candidates.push({ value: rich.semantic.overview_html, source: "wix.semantic.overview_html" });
  }
  if (rich.semantic?.overview_plain?.trim()) {
    candidates.push({ value: rich.semantic.overview_plain, source: "wix.semantic.overview_plain" });
  }
  if (wix.description_plain.trim()) {
    candidates.push({ value: wix.description_plain, source: "wix.description_plain" });
  }

  const featureBodies = rich.features
    .map((feature) => feature.body.trim())
    .filter((body) => body.length > 40 && !isSpecLikeDescriptionBlob(body));
  if (featureBodies.length) {
    const html = featureBodies.map((body) => `<p>${escapeHtml(body)}</p>`).join("");
    candidates.push({ value: html, source: "wix.features" });
  }

  let best: { html: string; source: string; score: number } | null = null;
  for (const candidate of candidates) {
    const html = htmlFromPlainCandidate(candidate.value);
    if (!html) continue;
    const cleaned = normalizeDescriptionHtml(html);
    if (!cleaned || isMigrationArtifactText(cleaned) || isJunkDescriptionValue(cleaned)) continue;
    const score = descriptionQualityScore(cleaned);
    if (!best || score > best.score) {
      best = { html: cleaned, source: candidate.source, score };
    }
  }

  return best;
}

function meaningfulSpecEntries(specs: Record<string, string> | null | undefined) {
  return Object.entries(specs ?? {})
    .filter(([key, value]) => !HIDDEN_SPEC_KEYS.has(key) && value?.trim() && !isPollutedSpecEntry(key, value))
    .slice(0, 10);
}

export function buildVerifiedFallbackDescription(row: DescriptionAuditDbRow) {
  const parts: string[] = [];
  const name = row.name.trim();
  const category = row.category?.trim();

  if (category) {
    parts.push(`<p>${escapeHtml(name)} is available in the ${escapeHtml(category)} range.</p>`);
  } else {
    parts.push(`<p>${escapeHtml(name)}.</p>`);
  }

  const tagline = descriptionPlainText(row.tagline);
  if (tagline && tagline.length >= 24 && !isJunkDescriptionValue(tagline) && !isMigrationArtifactText(tagline)) {
    parts.push(`<p>${escapeHtml(tagline)}</p>`);
  }

  const specEntries = meaningfulSpecEntries(row.specs ?? undefined);
  if (specEntries.length) {
    const items = specEntries
      .map(([key, value]) => `<li><strong>${escapeHtml(key)}</strong>: ${escapeHtml(value.trim())}</li>`)
      .join("");
    parts.push(`<ul>${items}</ul>`);
  }

  const html = parts.join("");
  const score = descriptionQualityScore(html);
  if (score < 25) return null;
  return { html, score };
}

export type DescriptionAuditEntry = {
  slug: string;
  name: string;
  current_score: number;
  target_score: number;
  reasons: DescriptionCleanupReason[];
  resolution_source: DescriptionResolutionSource;
  wix_slug: string | null;
  resolution_note: string;
  action: "update" | "skip_acceptable" | "manual_review";
  next_description: string | null;
  next_source_description: string | null;
};

export function auditProductDescription(
  row: DescriptionAuditDbRow,
  wixMatch: WixMatchResult | null
): DescriptionAuditEntry {
  const assessment = assessDescriptionCleanup(row);
  const base = {
    slug: row.slug,
    name: row.name,
    current_score: assessment.score,
    reasons: assessment.reasons,
    wix_slug: wixMatch?.product.wix_slug ?? null
  };

  if (!assessment.needsCleanup) {
    return {
      ...base,
      target_score: assessment.score,
      resolution_source: "none",
      resolution_note: "already_acceptable",
      action: "skip_acceptable",
      next_description: null,
      next_source_description: null
    };
  }

  const wixCandidate = wixMatch ? resolveWixDescription(wixMatch.product) : null;
  const fallbackCandidate = buildVerifiedFallbackDescription(row);

  const candidates: Array<{
    html: string;
    score: number;
    source: DescriptionResolutionSource;
    note: string;
    sourcePlain?: string;
  }> = [];

  if (wixCandidate && wixCandidate.score > assessment.score + 4) {
    candidates.push({
      html: wixCandidate.html,
      score: wixCandidate.score,
      source: "wix",
      note: wixCandidate.source,
      sourcePlain: wixMatch?.product.description_plain
    });
  }

  if (fallbackCandidate && fallbackCandidate.score > assessment.score + 4) {
    const beatsWix = !wixCandidate || fallbackCandidate.score >= wixCandidate.score;
    if (beatsWix || !wixCandidate) {
      candidates.push({
        html: fallbackCandidate.html,
        score: fallbackCandidate.score,
        source: "verified_fallback",
        note: "database_name_category_specs"
      });
    }
  }

  const winner = candidates.sort((left, right) => right.score - left.score)[0];
  if (!winner) {
    return {
      ...base,
      target_score: assessment.score,
      resolution_source: "none",
      resolution_note: wixMatch ? "no_usable_wix_or_verified_fallback" : "no_wix_match_and_insufficient_verified_data",
      action: "manual_review",
      next_description: null,
      next_source_description: null
    };
  }

  const currentNormalized = normalizeDescriptionHtml(row.description ?? "") ?? "";
  const winnerNormalized = normalizeDescriptionHtml(winner.html) ?? "";
  if (
    currentNormalized
    && descriptionPlainText(currentNormalized) === descriptionPlainText(winnerNormalized)
  ) {
    return {
      ...base,
      target_score: assessment.score,
      resolution_source: "none",
      resolution_note: "already_normalized",
      action: "skip_acceptable",
      next_description: null,
      next_source_description: null
    };
  }

  const shouldSetSource =
    !row.source_description?.trim()
    || isJunkDescriptionValue(row.source_description)
    || isMigrationArtifactText(row.source_description);

  return {
    ...base,
    target_score: winner.score,
    resolution_source: winner.source,
    resolution_note: winner.note,
    action: "update",
    next_description: winnerNormalized,
    next_source_description:
      shouldSetSource && winner.sourcePlain?.trim() ? winner.sourcePlain.trim() : null
  };
}

export type DescriptionAuditReport = {
  version: 1;
  generated_at: string;
  mode: "DRY_RUN" | "APPLIED";
  summary: {
    total_scanned: number;
    updated: number;
    skipped_acceptable: number;
    manual_review: number;
    errors: number;
  };
  updates: Array<{
    slug: string;
    name: string;
    previous_score: number;
    new_score: number;
    reasons: DescriptionCleanupReason[];
    resolution_source: DescriptionResolutionSource;
    resolution_note: string;
    wix_slug: string | null;
  }>;
  skipped_acceptable: Array<{ slug: string; name: string; score: number }>;
  manual_review: Array<{
    slug: string;
    name: string;
    score: number;
    reasons: DescriptionCleanupReason[];
    wix_slug: string | null;
    resolution_note: string;
  }>;
  errors: Array<{ slug: string; message: string }>;
};

export function buildDescriptionAuditReport(
  rows: DescriptionAuditDbRow[],
  wixProducts: WixProductSnapshot[],
  options: {
    mode?: "DRY_RUN" | "APPLIED";
    updated?: number;
    errors?: Array<{ slug: string; message: string }>;
  } = {}
): DescriptionAuditReport {
  const entries = rows.map((row) =>
    auditProductDescription(row, matchDbRowToWixProduct(row, wixProducts))
  );

  const updates = entries.filter((entry) => entry.action === "update");
  const skipped = entries.filter((entry) => entry.action === "skip_acceptable");
  const manual = entries.filter((entry) => entry.action === "manual_review");

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    mode: options.mode ?? "DRY_RUN",
    summary: {
      total_scanned: rows.length,
      updated: options.updated ?? updates.length,
      skipped_acceptable: skipped.length,
      manual_review: manual.length,
      errors: options.errors?.length ?? 0
    },
    updates: updates.map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      previous_score: entry.current_score,
      new_score: entry.target_score,
      reasons: entry.reasons,
      resolution_source: entry.resolution_source,
      resolution_note: entry.resolution_note,
      wix_slug: entry.wix_slug
    })),
    skipped_acceptable: skipped.map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      score: entry.current_score
    })),
    manual_review: manual.map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      score: entry.current_score,
      reasons: entry.reasons,
      wix_slug: entry.wix_slug,
      resolution_note: entry.resolution_note
    })),
    errors: options.errors ?? []
  };
}
