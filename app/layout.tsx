import type { Metadata, Viewport } from "next";
import { fontBody, fontDisplay } from "@/lib/fonts/storefront";
import "./globals.css";
import { NavbarInkBootstrapScript } from "@/components/navigation/navbar-ink-bootstrap-script";
import { JsonLd } from "@/components/seo/json-ld";
import { ObservabilityProvider } from "@/components/providers/observability-provider";
import { GlobalBusyFixedIndicator, GlobalBusyProvider } from "@/components/ui/global-busy";
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
      className={`${fontDisplay.variable} ${fontBody.variable} fonts-pending`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;function ready(){d.classList.remove("fonts-pending");d.classList.add("fonts-ready");}if(!document.fonts||!document.fonts.ready){ready();return;}document.fonts.ready.then(ready).catch(ready);setTimeout(ready,2500);}catch(e){document.documentElement.classList.add("fonts-ready");}})();`
          }}
        />
        <NavbarInkBootstrapScript />
      </head>
      <body suppressHydrationWarning>
        <JsonLd data={siteStructuredData} />
        <ObservabilityProvider>
          <GlobalBusyProvider>
            {children}
            <GlobalBusyFixedIndicator />
          </GlobalBusyProvider>
        </ObservabilityProvider>
      </body>
    </html>
  );
}
