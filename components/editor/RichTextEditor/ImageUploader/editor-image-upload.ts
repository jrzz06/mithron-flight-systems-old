"use client";

import type { Editor } from "@tiptap/react";

export async function uploadEditorImage(file: File, documentType: string, documentId: string) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("document_type", documentType);
  formData.set("document_id", documentId);

  const response = await fetch("/api/editor/upload-image", {
    method: "POST",
    body: formData
  });

  const payload = (await response.json()) as {
    publicUrl?: string;
    mediaAssetId?: string;
    error?: string;
  };

  if (!response.ok || !payload.publicUrl) {
    throw new Error(payload.error ?? "Image upload failed.");
  }

  return {
    publicUrl: payload.publicUrl,
    mediaAssetId: payload.mediaAssetId
  };
}

export function insertUploadedImage(
  editor: Editor,
  input: { publicUrl: string; mediaAssetId?: string; alt?: string; caption?: string }
) {
  editor
    .chain()
    .focus()
    .setImage({
      src: input.publicUrl,
      alt: input.alt ?? "",
      mediaAssetId: input.mediaAssetId ?? null,
      caption: input.caption ?? ""
    } as never)
    .run();
}

export async function handleEditorImageFiles(
  editor: Editor,
  files: FileList | File[],
  documentType: string,
  documentId: string
) {
  const list = Array.from(files).filter((file) => file.type.startsWith("image/"));
  for (const file of list) {
    const uploaded = await uploadEditorImage(file, documentType, documentId);
    insertUploadedImage(editor, uploaded);
  }
}
