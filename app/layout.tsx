import type { Metadata, Viewport } from "next";
import { googleSans, googleSansFlex } from "@/lib/fonts/storefront";
import "./globals.css";
import { NavbarInkBootstrapScript } from "@/components/navigation/navbar-ink-bootstrap-script";
import { JsonLd } from "@/components/seo/json-ld";
import { ObservabilityProvider } from "@/components/providers/observability-provider";
import { GlobalBusyFixedIndicator, GlobalBusyProvider } from "@/components/ui/global-busy";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildSiteStructuredData } from "@/lib/structured-data";
import { getSiteUrl } from "@/lib/site-url";

const siteUrl = getSiteUrl();
const siteStructuredData = buildSiteStructuredData();

export const metadata: Metadata = {
  applicationName: "Mithron",
  title: "Mithron",
  description: "Cinematic Mithron drone technology, smart agriculture, mapping, and site monitoring.",
  metadataBase: siteUrl,
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Mithron",
    title: "Mithron",
    description: "Drones, spares, support, and work-ready products for agriculture, mapping, and site monitoring."
  },
  robots: {
    index: true,
    follow: true
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/favicon.svg", type: "image/svg+xml" }]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050505"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${googleSansFlex.variable} ${googleSans.variable}`}
    >
      <head>
        <NavbarInkBootstrapScript />
      </head>
      <body suppressHydrationWarning>
        <JsonLd data={siteStructuredData} />
        <ObservabilityProvider>
          <GlobalBusyProvider>
            <TooltipProvider>
              {children}
              <GlobalBusyFixedIndicator />
            </TooltipProvider>
          </GlobalBusyProvider>
        </ObservabilityProvider>
      </body>
    </html>
  );
}
