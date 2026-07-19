import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { requirePermission } from "@/services/auth";
import { uploadEditorInlineImage } from "@/services/editor-image-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { userId } = await requirePermission("cms.write");
    const limit = await checkDistributedRateLimit(`editor-upload:${userId}`, 20, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const documentType = String(formData.get("document_type") ?? "draft");
    const documentId = String(formData.get("document_id") ?? "new");

    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    const uploaded = await uploadEditorInlineImage({
      file,
      documentType,
      documentId,
      actorId: userId
    });

    return NextResponse.json(uploaded);
  } catch (error) {
    console.error("[editor-upload] Upload failed.", error);
    const message = error instanceof Error ? error.message : "Upload failed.";
    const status =
      message.includes("Authentication") || message.includes("Unauthorized") || message.includes("permission")
        ? 401
        : 400;
    const clientMessage =
      status === 401
        ? "Authentication required."
        : message.includes("required") || message.includes("Too many") || message.includes("MIME") || message.includes("size")
          ? message
          : "Upload failed.";
    return NextResponse.json({ error: clientMessage }, { status });
  }
}
