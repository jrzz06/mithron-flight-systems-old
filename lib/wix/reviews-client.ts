export type WixReview = {
  id: string;
  entityId: string;
  namespace: string;
  content: {
    title: string;
    body: string;
    rating: number;
    imageUrls: string[];
  };
  authorName: string;
  foundHelpful: number;
  foundUnhelpful: number;
  helpfulness: number;
  verified: boolean;
  createdDate: string;
  updatedDate: string;
};

export type WixReviewsSnapshot = {
  source: "wix-reviews-api-v1";
  siteId: string;
  extractedAt: string;
  reviews: WixReview[];
};

type WixReviewsClientOptions = {
  apiKey: string;
  siteId: string;
  baseUrl?: string;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function reviewImageUrls(content: JsonRecord) {
  const media = Array.isArray(content.media) ? content.media : [];
  return media
    .map((item) => text(record(record(item).image).url))
    .filter(Boolean)
    .slice(0, 6);
}

export function normalizeWixReview(value: unknown): WixReview | null {
  const row = record(value);
  const content = record(row.content);
  const author = record(row.author);
  const id = text(row.id ?? row._id);
  const entityId = text(row.entityId);
  const rating = Math.min(5, Math.max(1, Math.round(finiteNumber(content.rating, 0))));
  const body = text(content.body);

  if (!id || !entityId || !body || !finiteNumber(content.rating, 0)) return null;

  const foundHelpful = Math.max(0, Math.round(finiteNumber(row.foundHelpful)));
  const foundUnhelpful = Math.max(0, Math.round(finiteNumber(row.foundUnhelpful)));

  return {
    id,
    entityId,
    namespace: text(row.namespace) || "stores",
    content: {
      title: text(content.title),
      body,
      rating,
      imageUrls: reviewImageUrls(content)
    },
    authorName: text(author.authorName) || "Wix Customer",
    foundHelpful,
    foundUnhelpful,
    helpfulness: finiteNumber(row.helpfulness, foundHelpful - foundUnhelpful),
    verified: row.verified === true,
    createdDate: text(row.createdDate ?? row._createdDate),
    updatedDate: text(row.updatedDate ?? row._updatedDate)
  };
}

export function rankWixReviews(reviews: WixReview[]) {
  return [...reviews].sort(
    (left, right) =>
      right.content.rating - left.content.rating ||
      right.helpfulness - left.helpfulness ||
      Date.parse(right.createdDate || "1970-01-01") -
        Date.parse(left.createdDate || "1970-01-01")
  );
}

function wixReviewsError(status: number, body: string) {
  if (status === 401 || status === 403) {
    return new Error(
      `Wix Reviews API authorization failed (${status}). Add the "Read reviews" permission to WIX_STUDIO_API_KEY and try again. ${body.slice(0, 300)}`
    );
  }
  return new Error(`Wix Reviews API request failed (${status}): ${body.slice(0, 400)}`);
}

export async function fetchWixReviews(
  options: WixReviewsClientOptions
): Promise<WixReviewsSnapshot> {
  const baseUrl = options.baseUrl ?? "https://www.wixapis.com";
  const reviews: WixReview[] = [];
  let cursor: string | undefined;

  do {
    const response = await fetch(`${baseUrl}/reviews/api/v1/reviews/query`, {
      method: "POST",
      headers: {
        Authorization: options.apiKey,
        "Content-Type": "application/json",
        "wix-site-id": options.siteId
      },
      body: JSON.stringify({
        query: {
          filter: { namespace: "stores" },
          sort: [
            { fieldName: "content.rating", order: "DESC" },
            { fieldName: "helpfulness", order: "DESC" }
          ],
          cursorPaging: {
            limit: 100,
            ...(cursor ? { cursor } : {})
          }
        },
        returnPrivateReviews: false
      })
    });

    if (!response.ok) {
      throw wixReviewsError(response.status, await response.text());
    }

    const payload = record(await response.json());
    const page = Array.isArray(payload.reviews) ? payload.reviews : [];
    for (const item of page) {
      const normalized = normalizeWixReview(item);
      if (normalized) reviews.push(normalized);
    }

    cursor = text(record(record(payload.metadata).cursors).next) || undefined;
  } while (cursor);

  const deduped = new Map(reviews.map((review) => [review.id, review]));
  return {
    source: "wix-reviews-api-v1",
    siteId: options.siteId,
    extractedAt: new Date().toISOString(),
    reviews: rankWixReviews([...deduped.values()])
  };
}
