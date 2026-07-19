# Security

## Secrets and credentials

- Never commit `.env`, `.env.local`, or `.env.*` files. `.gitignore` excludes them.
- Use `.env.example` as the template for required variables only — no real values.
- **Production:** set secrets in your deployment platform (Vercel, Railway, etc.). The app calls `assertProductionRuntimeConfig()` at startup in production and will fail fast if required variables are missing.
- **Local development:** `.env.local` is for your machine only. Do not expose it over the network or copy it into production images.
- Rotate `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, payment keys, and other secrets immediately if they were ever committed to git.

### Supabase MCP / Personal Access Tokens

- Never commit [`.cursor/mcp.json`](.cursor/mcp.json). It is gitignored; use [`.cursor/mcp.json.example`](.cursor/mcp.json.example) as the template.
- If a Supabase PAT (`sbp_…`) is exposed (shared machine, screenshot, accidental commit), **revoke it immediately** in the Supabase dashboard and issue a new token.
- Do not store long-lived admin tokens beside application source code.

### Production environment

- Set all secrets in your deployment platform (Vercel, Railway, etc.). Do not ship `.env.local` in production images.
- If a workstation with `.env.local` is shared or compromised, rotate every secret in that file before deploying.
- `ALLOW_DEMO_SEED` must not be `true` in production (startup will fail).
- Cron/internal bearer secrets (`CRON_SECRET`, `NOTIFICATION_DISPATCH_SECRET`, `PAYMENT_EXPIRE_SECRET`, `HEALTH_CHECK_SECRET`) should be at least 32 cryptographically random bytes.

Verify `.env.local` is ignored:

```bash
npm run security:verify-secrets
```

Or manually:

```bash
git check-ignore -v .env.local
git log --all --full-history -- .env.local
```

## API route protection

Page routes (`/admin`, `/warehouse`, `/supplier`, `/account`, etc.) are RBAC-gated in `proxy.ts`.

**The proxy also enforces session/staff/admin policies for many `/api/*` routes** via `resolveApiRoutePolicy()` in `lib/auth/access-control.ts`. Policies of kind `session`, `staff`, and `admin` require a valid Supabase session and DB-backed role at the edge.

**Every new `/api/*` route must still enforce its own authentication and authorization in the handler**, especially for policies that pass through at the edge:

- `public` — no session at edge; handler must rate-limit and validate input
- `bearer` / `upload_token` / `session_or_guest` — no session check at edge; handler must verify bearer secrets, guest audit tokens, or session ownership

Handler patterns:

- `createClient()` + `getClaims()` / `getUser()` for session auth
- `requirePermission()` for RBAC
- `safeBearerEquals()` / `authorizeBearerSecret()` for cron/internal bearer secrets
- `checkDistributedRateLimit()` for abuse-sensitive endpoints (fail-closed by default in production when backends are degraded)

## Service-role reads

`fetchAdminRecordsByColumn` bypasses RLS. Runtime behavior is unchanged: a permission check runs **only** when `requiredPermission` is passed.

For new call sites, pass one of:

- `requiredPermission` — user-facing paths that should enforce RBAC here
- `skipPermissionCheck: true` — guest/system paths that authorize separately (invoice access, payment webhooks/verify, checkout status)

Prefer an authenticated Supabase client for reads that should respect RLS.

Rotate `SUPABASE_SERVICE_ROLE_KEY` immediately if it was ever exposed (logs, client bundle, committed env file).

## Session handoff headers

The proxy injects verified `x-mithron-auth-*` headers onto the **request** (not the response) after resolving the DB-backed role via `current_enterprise_role`. Inbound client-supplied handoff headers are **stripped** in `applyRequestSecurityHeaders()` before any downstream Server Component reads them. Never trust handoff headers set outside the proxy.

Control-plane layouts (`admin` / `warehouse` / `supplier`) must call `getCurrentAuthContext()` so handoff role hints are cross-checked against the session JWT. Do not read handoff headers directly in layouts.

## Admin MFA

`AUTH_ADMIN_MFA_REQUIRED=true` gates admin access on Supabase MFA enrollment metadata. Ensure enrollment UI is wired before enabling in production.

## Storage security

- Public Supabase storage buckets (`mithron-products`, `mithron-cms`, etc.) are intentionally world-readable for storefront media.
- Never upload sensitive documents to public buckets. Use `mithron-warehouse-documents` (private) for operational files.
- SVG uploads are blocked server-side in `assertAllowedMediaMimeType()`.
- Upload paths that have file bytes also call `assertMediaMimeMatchesContent()` to reject clear MIME spoofing. Inconclusive signatures keep the declared allowlisted MIME (no false rejects).

## Content Security Policy

- `style-src 'unsafe-inline'` is required for Tailwind utility classes (accepted risk).
- `img-src` is restricted to `'self'`, Supabase origin, Razorpay, `data:`, and `blob:` in production.

## Media routes

Mission image routes only serve allowlisted filenames from `public/media/...`. Dev-only Cursor asset fallbacks are disabled in production.
