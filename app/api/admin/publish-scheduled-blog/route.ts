import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { withCronLock } from "@/lib/cron-lock";
import { authorizeBearerSecret, type BearerAuthResult } from "@/lib/api/bearer-auth";
import { publishDueScheduledBlogPosts } from "@/services/blog-posts";

function bearerAuthResponse(auth: BearerAuthResult) {
  if (auth === "rate_limited") {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  if (auth === "misconfigured") {
    return NextResponse.json({ error: "Cron secret is not configured." }, { status: 503 });
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}

async function handlePublishScheduled(request: Request) {
  const auth = await authorizeBearerSecret(request, process.env.CRON_SECRET);
  const denied = bearerAuthResponse(auth);
  if (denied) return denied;

  const locked = await withCronLock("lock:publish-scheduled-blog", 55, async () => {
    const result = await publishDueScheduledBlogPosts(null);
    if (result.publishedCount > 0) {
      revalidateTag("blog", "max");
      revalidatePath("/blog");
      revalidatePath("/");
      for (const id of result.ids) {
        revalidatePath("/admin/blog");
        void id;
      }
    }
    return result;
  });

  return locked instanceof NextResponse ? locked : NextResponse.json(locked);
}

/** Vercel cron — publish blog posts whose published_at has elapsed while still draft. */
export async function GET(request: Request) {
  return handlePublishScheduled(request);
}

export async function POST(request: Request) {
  return handlePublishScheduled(request);
}
