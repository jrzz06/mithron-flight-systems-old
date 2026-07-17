import type { SupabaseClient, User } from "@supabase/supabase-js";

const MAX_LOOKUP_PAGES = 5;
const LOOKUP_PAGE_SIZE = 200;

export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string
): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  for (let page = 1; page <= MAX_LOOKUP_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: LOOKUP_PAGE_SIZE });
    if (error) throw error;

    const match = data.users.find((user) => user.email?.toLowerCase() === normalized) ?? null;
    if (match) return match;
    if (data.users.length < LOOKUP_PAGE_SIZE) break;
  }

  return null;
}
