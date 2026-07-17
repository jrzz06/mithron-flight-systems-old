import type { MetadataRoute } from "next";
import { toAbsoluteUrl } from "@/lib/site-url";

const DISALLOWED_PATHS = [
  "/admin/",
  "/warehouse/",
  "/supplier/",
  "/operations/",
  "/api/",
  "/account/",
  "/cart",
  "/checkout",
  "/login",
  "/logout",
  "/auth/",
  "/search?*"
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...DISALLOWED_PATHS]
    },
    sitemap: toAbsoluteUrl("/sitemap.xml"),
    host: toAbsoluteUrl("/")
  };
}
