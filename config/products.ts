import { interestAssets } from "@/config/assets";
import type { HeroSlide, Interest } from "@/config/types";
export { navigation } from "@/config/navigation";

const heroLocalImages = {
  agriculture: "/assets/hero/hero-slide-01.webp",
  mapping: "/assets/hero/hero-slide-02.webp",
  ecosystem: "/assets/hero/hero-slide-03.webp"
} as const;

const HERO_EXTERNAL_CTA_HREF = "https://www.mithronsmart.com";

export const heroSlides: HeroSlide[] = [
  {
    id: "ag10-arrival",
    productSlug: "source-agri-kisan-drone-small-8-liter",
    title: "Drone is Mithron",
    subtitle: "Welcome to India's 1st & Leading Drone Ecosystem Aggregator",
    cta: "Visit Mithron Smart",
    href: HERO_EXTERNAL_CTA_HREF,
    image: { src: heroLocalImages.agriculture, alt: "Mithron agriculture drone flying over glacial terrain at sunrise", width: 2560, height: 1023, local: true, priority: true },
    poster: { src: heroLocalImages.agriculture, alt: "Mithron agriculture drone flying over glacial terrain at sunrise", width: 2560, height: 1023, local: true, priority: true },
    theme: "light",
    composition: {
      mode: "full-bleed",
      textTone: "dark",
      mediaPosition: "72% 52%",
      mobileMediaPosition: "78% 47%",
      productDominance: "flagship"
    }
  },
  {
    id: "mapping-flight",
    productSlug: "source-10x-seeker-optical-zoom-cmera-survey-drone",
    title: "Global Drone Connect",
    subtitle: "A marketplace to connect for Global products Import and Export / Live Price Bid",
    cta: "Visit Mithron Smart",
    href: HERO_EXTERNAL_CTA_HREF,
    image: { src: heroLocalImages.mapping, alt: "Mithron caged drone operating over a night sports court", width: 2560, height: 1280, local: true },
    poster: { src: heroLocalImages.mapping, alt: "Mithron caged drone operating over a night sports court", width: 2560, height: 1280, local: true },
    theme: "dark",
    composition: {
      mode: "full-bleed",
      textTone: "light",
      mediaPosition: "62% 58%",
      mobileMediaPosition: "66% 48%",
      productDominance: "flagship"
    }
  },
  {
    id: "drone-ecosystem",
    productSlug: "source-v9-flight-controller-for-agriculture-drones",
    title: "One Stop Drone Mithron",
    subtitle: "Sales / Rental Service / Troubleshooting / Aggregation / Academics / Import / Loan",
    cta: "Visit Mithron Smart",
    href: HERO_EXTERNAL_CTA_HREF,
    image: { src: heroLocalImages.ecosystem, alt: "Mithron medical delivery drone flying over a coastal horizon at twilight", width: 2560, height: 1060, local: true },
    poster: { src: heroLocalImages.ecosystem, alt: "Mithron medical delivery drone flying over a coastal horizon at twilight", width: 2560, height: 1060, local: true },
    theme: "dark",
    composition: {
      mode: "full-bleed",
      textTone: "light",
      mediaPosition: "78% 46%",
      mobileMediaPosition: "82% 42%",
      productDominance: "flagship"
    }
  }
];

export const interests: Interest[] = [
  { slug: "agriculture", label: "Smart Agriculture", headline: "AI powered crop intelligence and farm automation.", image: { src: interestAssets.agriculture, alt: "Mithron smart agriculture drone over crop rows" } },
  { slug: "video-drones", label: "Video Drones", headline: "Cinematic aerial capture and field documentation systems.", image: { src: interestAssets.videoDrones, alt: "Mithron video drone cinematic field scene" } },
  { slug: "creative-drones", label: "Creative Drones", headline: "Arena flight, drone soccer, education, and creative aerospace programs.", image: { src: interestAssets.creativeDrones, alt: "Mithron creative drone arena scene" } },
  { slug: "mapping", label: "Mapping & Survey", headline: "Aerial intelligence for terrain, assets, and planning.", image: { src: interestAssets.mapping, alt: "Mithron mapping and survey drone over terrain" } },
  { slug: "smart-farming", label: "Precision Spraying", headline: "Autonomous coverage with less waste and more control.", image: { src: interestAssets.smartFarming, alt: "Mithron precision spraying field intelligence" } },
  { slug: "defense-security", label: "Defense & Surveillance", headline: "Advanced monitoring for critical zones and field teams.", image: { src: interestAssets.defenseSecurity, alt: "Mithron defense and surveillance drone scene" } },
  { slug: "industrial-inspection", label: "Industrial Inspection", headline: "Powerline, infrastructure, and site analysis from above.", image: { src: interestAssets.industrialInspection, alt: "Mithron industrial inspection drone deployment" } },
  { slug: "surveillance", label: "AI Monitoring", headline: "Live aerial awareness for distributed operations.", image: { src: interestAssets.surveillance, alt: "Mithron AI monitoring surveillance grid scene" } },
  { slug: "components", label: "Ecosystem", headline: "Hardware, payloads, controllers, service, and software.", image: { src: interestAssets.components, alt: "Mithron drone ecosystem components and payloads" } }
];
