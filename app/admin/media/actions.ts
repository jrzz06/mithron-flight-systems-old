"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdminPermission } from "@/services/auth";
import { deleteAdminRecord } from "@/services/admin-actions";
import { assertSupabaseAdminConfig } from "@/lib/env";

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

export type MediaLibraryItem = {
  id: string;
  publicUrl: string;
  folder: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  altText: string;
  updatedAt: string;
};

export async function listMediaLibraryItems(options: { q?: string; limit?: number } = {}): Promise<MediaLibraryItem[]> {
  await requireAdminPermission("media.write");
  const config = assertSupabaseAdminConfig();
  const limit = Math.max(1, Math.min(500, options.limit ?? 200));
  const params = [
    "select=id,public_url,folder,mime_type,width,height,size_bytes,alt_text,updated_at",
    "order=updated_at.desc",
    `limit=${limit}`
  ];
  const q = (options.q ?? "").trim();
  if (q) {
    const pattern = encodeURIComponent(`*${q}*`);
    params.push(`or=(id.ilike.${pattern},folder.ilike.${pattern},alt_text.ilike.${pattern},public_url.ilike.${pattern})`);
  }
  const response = await fetch(`${config.url}/rest/v1/media_assets?${params.join("&")}`, {
    headers: headers(config.serviceRoleKey),
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Failed to load media library (${response.status}).`);
  }
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    publicUrl: String(row.public_url ?? ""),
    folder: String(row.folder ?? ""),
    mimeType: String(row.mime_type ?? ""),
    width: typeof row.width === "number" ? row.width : null,
    height: typeof row.height === "number" ? row.height : null,
    sizeBytes: typeof row.size_bytes === "number" ? row.size_bytes : null,
    altText: String(row.alt_text ?? ""),
    updatedAt: String(row.updated_at ?? "")
  }));
}

export async function deleteMediaLibraryItemFormAction(formData: FormData) {
  const actor = await requireAdminPermission("media.write");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await deleteAdminRecord("media_assets", "id", id, actor.userId);
  revalidateTag("cms", "max");
  revalidatePath("/admin/media");
  revalidatePath("/admin/cms");
}
