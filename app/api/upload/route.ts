import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { isUploadApiRetired, runCanonicalBatchUpload } from "@/lib/media/canonical-batch-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadRequestBody = {
  dryRun?: unknown;
  limit?: unknown;
};

function json(status: number, payload: Record<string, unknown>, extraHeaders?: HeadersInit) {
  return NextResponse.json(payload, { status, headers: extraHeaders });
}

function safeTokenEquals(candidate: string, expected: string) {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  if (candidateBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

function getRequestToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  return request.headers.get("x-mithron-upload-token")?.trim() ?? "";
}

async function readUploadBody(request: Request): Promise<UploadRequestBody> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return {};
  const text = await request.text();
  if (!text.trim()) return {};
  const body = JSON.parse(text) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Upload request body must be a JSON object.");
  }
  return body as UploadRequestBody;
}

function sanitizeLimit(limit: unknown) {
  if (limit === undefined) return undefined;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit <= 0 || limit > 500) {
    throw new Error("limit must be an integer between 1 and 500.");
  }
  return limit;
}

export async function POST(request: Request) {
  if (isUploadApiRetired()) {
    return json(410, {
      status: "RETIRED",
      code: "UPLOAD_API_RETIRED",
      message: "Uploads are not available from this endpoint anymore.",
      alternatives: [
        "tools/regenerate-editorial-manifest.mjs",
        "tools/backfill-canonical-media.mjs"
      ]
    });
  }

  const expectedToken = process.env.MITHRON_ASSET_UPLOAD_TOKEN;
  if (!expectedToken) {
    return json(503, {
      status: "FAILED",
      code: "UPLOAD_TOKEN_MISSING",
      message: "Uploads aren't available right now. Please try again later."
    });
  }

  const requestToken = getRequestToken(request);
  if (!requestToken || !safeTokenEquals(requestToken, expectedToken)) {
    return json(401, {
      status: "FAILED",
      code: "UNAUTHORIZED",
      message: "A valid bearer upload token is required."
    });
  }

  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`upload:${rateKey}`, 5, 60_000);
  if (!limit.allowed) {
    return json(429, {
      status: "FAILED",
      code: "RATE_LIMITED",
      message: "Too many upload requests."
    });
  }

  let body: UploadRequestBody;
  try {
    body = await readUploadBody(request);
  } catch (error) {
    return json(400, {
      status: "FAILED",
      code: "INVALID_JSON",
      message: error instanceof Error ? error.message : "Invalid JSON request body."
    });
  }

  const dryRun = body.dryRun === true;
  if (!dryRun) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return json(503, {
        status: "FAILED",
        code: "SUPABASE_URL_MISSING",
        message: "Uploads aren't available right now. Please try again later."
      });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json(503, {
        status: "FAILED",
        code: "SUPABASE_SERVICE_ROLE_KEY_MISSING",
        message: "Uploads aren't available right now. Please try again later."
      });
    }
  }

  try {
    const uploadLimit = sanitizeLimit(body.limit);
    const result = await runCanonicalBatchUpload({ dryRun, limit: uploadLimit });
    return json(200, {
      ...result,
      deprecated: true,
      note: "Manifest regeneration is deferred to tools/regenerate-editorial-manifest.mjs."
    }, {
      "X-Mithron-Upload-Deprecated": "true"
    });
  } catch (error) {
    console.error("[upload] Canonical media upload failed.", error);
    return json(500, {
      status: "FAILED",
      code: "UPLOAD_FAILED",
      message: "Canonical media upload failed."
    });
  }
}
