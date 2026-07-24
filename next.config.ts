import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true"
});

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)));

const baseSecurityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff"
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin"
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()"
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload"
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin"
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-site"
  }
];

const adminSecurityHeaders = [
  ...baseSecurityHeaders,
  {
    key: "X-Frame-Options",
    value: "DENY"
  }
];

const storefrontSecurityHeaders = [
  ...baseSecurityHeaders,
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN"
  }
];

function supabaseImageHostname() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!rawUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL is required in production.");
    }
    return "localhost";
  }

  try {
    return new URL(rawUrl).hostname;
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
}

function mediaCdnImageHostname() {
  const raw = process.env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN?.trim();
  if (raw) {
    try {
      return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname;
    } catch {
      return null;
    }
  }
  // Same-origin `/cdn-media/...` proxy (local + Vercel) unless explicitly disabled.
  const viaVercel = process.env.NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL?.trim().toLowerCase();
  const autoVercel = viaVercel !== "0" && viaVercel !== "false" && viaVercel !== "off";
  if (!autoVercel) return null;
  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (site) return new URL(site.startsWith("http") ? site : `https://${site}`).hostname;
  } catch {
    /* fall through */
  }
  return "final-mithron-deploy.vercel.app";
}

function supabaseStorageOriginForRewrite() {
  const rawUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    // Last-resort: keep /cdn-media rewrites alive if env is missing at build time.
    // Without this, /cdn-media returns HTML that Vercel may cache for a year.
    "https://ictnoydmxlywwxwnugal.supabase.co";
  try {
    return new URL(rawUrl).origin;
  } catch {
    return null;
  }
}

function developmentAllowedOrigins() {
  if (process.env.NODE_ENV !== "development") return undefined;
  const extras = (process.env.DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return ["127.0.0.1", "localhost", ...extras];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: developmentAllowedOrigins(),
  serverExternalPackages: ["sharp"],
  turbopack: {
    root: appRoot
  },
  images: {
    localPatterns: [
      { pathname: "/media/**" },
      { pathname: "/assets/**" },
      { pathname: "/optimized/**" },
      { pathname: "/cdn-media/**" }
    ],
    remotePatterns: [
      { protocol: "https", hostname: supabaseImageHostname() },
      { protocol: "https", hostname: "media.gettyimages.com" },
      ...(mediaCdnImageHostname() ? [{ protocol: "https" as const, hostname: mediaCdnImageHostname()! }] : [])
    ],
    // Next.js 16 defaults to [75] only; allowlist qualities used by next/image.
    qualities: [75, 92],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [64, 96, 160, 256, 384]
  },
  experimental: {
    // React View Transitions for product card → PDP shared-element morphs.
    viewTransition: true,
    optimizePackageImports: [
      "lucide-react",
      "sonner",
      "@tanstack/react-virtual",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/core",
      "@tiptap/extension-character-count",
      "@tiptap/extension-color",
      "@tiptap/extension-highlight",
      "@tiptap/extension-image",
      "@tiptap/extension-link",
      "@tiptap/extension-placeholder",
      "@tiptap/extension-table",
      "@tiptap/extension-table-cell",
      "@tiptap/extension-table-header",
      "@tiptap/extension-table-row",
      "@tiptap/extension-task-item",
      "@tiptap/extension-task-list",
      "@tiptap/extension-text-align",
      "@tiptap/extension-text-style",
      "@tiptap/extension-underline",
      "zustand",
      "@radix-ui/react-slot",
      "sanitize-html"
    ]
  },
  async redirects() {
    return [
      { source: "/favicon.ico", destination: "/favicon.svg", permanent: true },
      { source: "/agriculture", destination: "/category/agri-drones", permanent: true },
      { source: "/video-drones", destination: "/category/video-drones", permanent: true },
      { source: "/creative-drones", destination: "/category/creative-drones", permanent: true },
      { source: "/mapping", destination: "/category/survey-drones", permanent: true },
      { source: "/surveillance", destination: "/category/surveillance-drones", permanent: true },
      { source: "/accessories", destination: "/category/accessories", permanent: true },
      { source: "/dronecare", destination: "/category/accessories", permanent: true },
      { source: "/drone-care", destination: "/category/accessories", permanent: true },
      { source: "/drone_care", destination: "/category/accessories", permanent: true },
      { source: "/industrial", destination: "/category/global-products", permanent: true },
      {
        source: "/products",
        has: [{ type: "query", key: "category", value: "global-products" }],
        destination: "/category/global-products",
        permanent: true
      },
      {
        source: "/products",
        has: [{ type: "query", key: "category", value: "global-product" }],
        destination: "/category/global-products",
        permanent: true
      },
      { source: "/supplier/orders", destination: "/supplier", permanent: true }
    ];
  },
  async rewrites() {
    const supabaseOrigin = supabaseStorageOriginForRewrite();
    if (!supabaseOrigin) return [];
    // Vercel Edge Network caches `/cdn-media/*` (see headers) and proxies to Supabase Storage.
    return [
      {
        source: "/cdn-media/storage/v1/object/public/:path*",
        destination: `${supabaseOrigin}/storage/v1/object/public/:path*`
      }
    ];
  },
  async headers() {
    return [
      {
        source: "/admin/:path*",
        headers: adminSecurityHeaders
      },
      {
        source: "/:path*",
        headers: storefrontSecurityHeaders
      },
      {
        source: "/cdn-media/:path*",
        headers: [
          {
            // Proxied storage — never mark immutable. A mistaken HTML soft-404
            // must not stick in the CDN for a year.
            key: "Cache-Control",
            value: "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400"
          },
          {
            key: "CDN-Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400"
          },
          {
            key: "Vercel-CDN-Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400"
          },
          {
            // Allow preview / project hosts and <img> cross-origin loads.
            key: "Cross-Origin-Resource-Policy",
            value: "cross-origin"
          }
        ]
      },
      {
        source: "/optimized/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      },
      {
        source: "/media/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      },
      {
        source: "/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      }
    ];
  }
};

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: false,
  webpack: {
    treeshake: {
      removeDebugLogging: true
    }
  }
});
