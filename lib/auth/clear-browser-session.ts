import { createClient } from "@/lib/client";

/**
 * Clears the browser Supabase session so `onAuthStateChange` fires `SIGNED_OUT`.
 * Uses `scope: "local"` so it does not race with server-side revoke/cookie clear.
 */
export async function clearBrowserAuthSession(): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Logout UI must never hang if the browser client is unavailable.
  }
}
