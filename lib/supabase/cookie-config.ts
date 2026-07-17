import type { CookieOptions } from "@supabase/ssr";

export function resolveSupabasePublishableKey(env: Record<string, string | undefined> = process.env) {
  if (env !== process.env) {
    return (
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )!;
  }

  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )!;
}

export function resolveSupabaseCookieOptions(): CookieOptions {
  return {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  };
}
