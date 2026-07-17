import { cache } from "react";
import { isStrictAdminRole } from "@/lib/auth/access-control";
import { getCurrentAuthContext } from "@/services/auth";

export const resolveCmsDraftPreviewAccess = cache(async (previewParam: string | string[] | undefined) => {
  const enabled = previewParam === "draft" || (Array.isArray(previewParam) && previewParam.includes("draft"));
  if (!enabled) return false;

  const auth = await getCurrentAuthContext();
  return Boolean(auth.role && isStrictAdminRole(auth.role));
});
