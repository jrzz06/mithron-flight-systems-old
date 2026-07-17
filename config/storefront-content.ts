import { footerColumns } from "@/config/footer-links";

export type FooterColumn = {
  title: string;
  links: Array<[label: string, href: string]>;
};

export type FooterContent = {
  leadTitle: string;
  leadBody: string;
  contactEmail?: string;
  contactPhone?: string;
  emailPlaceholder?: string;
  ctaLabel?: string;
  columns: FooterColumn[];
  legalText: string;
};

export const footerContent = {
  leadTitle: "Mithron drones & services",
  leadBody:
    "India's drone store and service network — connecting aircraft, pilots, farmers, and businesses through Mithron Smart, AGRONE, ZRONEO, and the Mithron Store.",
  contactEmail: "dronecare@mithronsmart.com",
  contactPhone: "+91-9591481517 , +91-8939123421",
  columns: footerColumns,
  legalText: "© 2026 Mithron India Smart Services Private Limited. All rights reserved."
} satisfies FooterContent;

export type ProductReviewContent = {
  id?: string;
  name: string;
  body: string;
  productSlug?: string | null;
  rating?: number | null;
};

export type ProductSupportContent = {
  faqs: Array<[question: string, answer: string]>;
  reviews: ProductReviewContent[];
};

export const productSupportContent = {
  faqs: [
    ["How does Mithron confirm your setup?", "Mithron aligns the selected aircraft, payload, operating region, operator readiness, and Drone Care requirements before delivery and training begin."],
    ["Can one product range support different uses?", "Yes. Mithron connects aircraft, controllers, batteries, payloads, planning tools, and support services across agriculture, mapping, and surveillance work."],
    ["How is operator support handled?", "Training-first onboarding, service guidance, and on-site support are included from the start—not added later."]
  ],
  reviews: []
} satisfies ProductSupportContent;

// ---------------------------------------------------------------------------
// External destinations (keep configurable + single source of truth)
// ---------------------------------------------------------------------------

export const MITHRON_ZRONEO_APP_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.mithronfarmer";

// ---------------------------------------------------------------------------
// Homepage product shelf rails
// ---------------------------------------------------------------------------

export type HomeShelf = {
  id: string;
  eyebrow: string;
  title: string;
  viewAllHref: string;
  categoryFilter: string;
  maxCards: number;
};

export const homeShelves: HomeShelf[] = [
  {
    id: "agri",
    eyebrow: "FEATURED COLLECTION",
    title: "Drone World",
    viewAllHref: "/agriculture",
    categoryFilter: "Agri Drones",
    maxCards: 5
  },
  {
    id: "accessories",
    eyebrow: "ESSENTIAL CARE",
    title: "Drone Care",
    viewAllHref: "/accessories",
    categoryFilter: "Accessories",
    maxCards: 5
  },
  {
    id: "surveillance",
    eyebrow: "GLOBAL SELECTION",
    title: "Global Product",
    viewAllHref: "/surveillance",
    categoryFilter: "Surveillance Drones",
    maxCards: 5
  }
];
