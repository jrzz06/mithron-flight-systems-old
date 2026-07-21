import type { Metadata, Viewport } from "next";
import "@/lib/fonts/misans";
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
    <html lang="en" suppressHydrationWarning className="fonts-pending">
      <head>
        <link
          rel="preload"
          href="/fonts/b8005e4731c12f9b1655028b1e379a35.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/f68542001156732bb26af687f85956e2.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;function ready(){d.classList.remove("fonts-pending");d.classList.add("fonts-ready");}if(!document.fonts||!document.fonts.load){ready();return;}Promise.all([document.fonts.load('400 1em "MiSans VF"'),document.fonts.load('700 1em "MiSans VF"')]).then(ready).catch(ready);setTimeout(ready,2500);}catch(e){document.documentElement.classList.add("fonts-ready");}})();`
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
