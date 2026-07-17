import { headers } from "next/headers";
import { normalizeCmsRole, type CmsRole } from "@/lib/auth/access-control";

export const SESSION_HANDOFF_USER_HEADER = "x-mithron-auth-user-id";
export const SESSION_HANDOFF_ROLE_HEADER = "x-mithron-auth-role";
export const SESSION_HANDOFF_VERIFIED_HEADER = "x-mithron-auth-verified";

export type SessionHandoff = {
  userId: string;
  role: CmsRole;
};

export async function readSessionHandoff(): Promise<SessionHandoff | null> {
  const headerStore = await headers();
  if (headerStore.get(SESSION_HANDOFF_VERIFIED_HEADER) !== "1") {
    return null;
  }

  const userId = headerStore.get(SESSION_HANDOFF_USER_HEADER)?.trim() ?? "";
  const role = normalizeCmsRole(headerStore.get(SESSION_HANDOFF_ROLE_HEADER));
  if (!userId || !role) {
    return null;
  }

  return { userId, role };
}
