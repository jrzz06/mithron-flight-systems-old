import { storefrontMediaPaths } from "@/config/storefront-media-paths";
import type { PressCoverageItem } from "@/lib/press/press-coverage-shared";

export const defaultPressCoverageItems: PressCoverageItem[] = [
  {
    id: "default-yourstory",
    publisher: "YOURSTORY",
    title: "Mithron Company Profile on YourStory",
    description:
      "Explore Mithron's company profile, drone services, milestones, and India's growing drone service network.",
    cover_image: {
      url: storefrontMediaPaths.press.companyNetwork,
      alt: "Agricultural drone flying above India's nationwide farmland service network"
    },
    external_url: "https://yourstory.com/companies/mithron",
    sort_order: 10,
    is_featured: true,
    status: "published",
    is_visible: true,
    published_at: null,
    archived_at: null
  },
  {
    id: "default-ciotechoutlook",
    publisher: "CIO TECH OUTLOOK",
    title: "How Mithron is Advancing India's Drone Ecosystem",
    description:
      "Learn how Mithron aggregates drone owners and pilots to deliver affordable agricultural spraying, calibrated field operations, and scalable drone services.",
    cover_image: {
      url: storefrontMediaPaths.press.precisionPilotEcosystem,
      alt: "Agricultural drone precision spraying while trained pilots supervise the field"
    },
    external_url: "https://www.ciotechoutlook.com/technology/drone-tech-startups/vendor/2025/mithron",
    sort_order: 20,
    is_featured: true,
    status: "published",
    is_visible: true,
    published_at: null,
    archived_at: null
  },
  {
    id: "default-tracxn",
    publisher: "TRACXN",
    title: "Mithron Company Snapshot & Market Profile",
    description:
      "View Mithron's seed-stage company overview, funding history, sector classification, and competitive landscape across India's drone market.",
    cover_image: {
      url: storefrontMediaPaths.press.indiaDroneMarket,
      alt: "Commercial agriculture, inspection, mapping, and logistics drones in a modern hangar"
    },
    external_url:
      "https://tracxn.com/d/companies/mithronsmart/__FmiZvI2eEsKhWNfarQr2GubD-_ogeU7kHosSGe9dQSo",
    sort_order: 30,
    is_featured: false,
    status: "published",
    is_visible: true,
    published_at: null,
    archived_at: null
  }
];
