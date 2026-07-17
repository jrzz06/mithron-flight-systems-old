import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/env";
import { supabaseFetch } from "@/lib/fetch-with-timeout";
import { resolveSupabaseCookieOptions } from "@/lib/supabase/cookie-config";

export function createClient() {
  const config = getSupabasePublicConfig();
  if (!config.configured) {
    throw new Error(config.message);
  }

  return createBrowserClient(config.url, config.publishableKey, {
    cookieOptions: resolveSupabaseCookieOptions(),
    global: {
      fetch: supabaseFetch()
    }
  });
}
