import { NextResponse } from "next/server";
import { PermissionDeniedError, roleHasPermission } from "@/lib/auth/permissions";
import { ProfileDisabledError } from "@/lib/auth/profile-disabled";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { getCurrentAuthContext } from "@/services/auth";
import { uploadEditorInlineImage } from "@/services/editor-image-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext();
    if (context.disabled) {
      throw new ProfileDisabledError();
    }
    // CMS editors need cms.write; suppliers uploading product description images use media.write.
    if (!roleHasPermission(context.role, "cms.write") && !roleHasPermission(context.role, "media.write")) {
      throw new PermissionDeniedError("Image upload requires cms.write or media.write.");
    }
    const userId = context.userId;
    if (!userId) {
      throw new PermissionDeniedError("Authentication required.");
    }
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
