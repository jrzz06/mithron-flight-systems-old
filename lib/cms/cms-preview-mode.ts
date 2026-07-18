import { cache } from "react";
import { isStrictAdminRole } from "@/lib/auth/access-control";
import { getCurrentAuthContext } from "@/services/auth";

/** Returns true when the current session is a strict admin (CMS draft preview gate). */
export const canAccessCmsDraftPreview = cache(async () => {
  const auth = await getCurrentAuthContext();
  return Boolean(auth.role && isStrictAdminRole(auth.role));
});

/**
 * Legacy query-param gate (`?cms_preview=draft`) kept for contract coverage.
 * Prefer dedicated `/preview/*` routes for new draft preview entry points.
 */
export const resolveCmsDraftPreviewAccess = cache(async (previewParam: string | string[] | undefined) => {
  const enabled = previewParam === "draft" || (Array.isArray(previewParam) && previewParam.includes("draft"));
  if (!enabled) return false;
  return canAccessCmsDraftPreview();
});
