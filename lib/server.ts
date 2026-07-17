import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabaseFetch } from '@/lib/fetch-with-timeout'
import { resolveSupabaseCookieOptions, resolveSupabasePublishableKey } from '@/lib/supabase/cookie-config'

type CookieToSet = { name: string; value: string; options: CookieOptions }

function resolvePublishableKey() {
  return resolveSupabasePublishableKey()
}

function resolveCookieOptions(): CookieOptions {
  return resolveSupabaseCookieOptions()
}

/**
 * If using Fluid compute: Don't put this client in a global variable. Always create a new client within each
 * function when using it.
 */
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    resolvePublishableKey(),
    {
      cookieOptions: resolveCookieOptions(),
      global: {
        fetch: supabaseFetch()
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

/**
 * Route handlers that mutate auth sessions must copy Set-Cookie headers onto the
 * returned NextResponse. Relying on cookies().set() alone does not persist sessions
 * for JSON or redirect responses in the App Router.
 */
export async function createAuthRouteClient() {
  const cookieStore = await cookies()
  const pendingCookies: CookieToSet[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    resolvePublishableKey(),
    {
      cookieOptions: resolveCookieOptions(),
      global: {
        fetch: supabaseFetch()
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          pendingCookies.splice(0, pendingCookies.length, ...cookiesToSet)
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Route handlers apply cookies on the response object below.
          }
        },
      },
    }
  )

  function applySessionCookies(response: NextResponse) {
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options)
    })
    return response
  }

  return { supabase, applySessionCookies }
}
