/**
 * Snapshot of the admin_settings.payload.homepage shape used by the CMS.
 * Kept as a rollback / migration reference during homepage CMS consolidation.
 *
 * Live layout (pre-unified):
 * {
 *   // v1 live fields (shelves, missions, testimonials, about) — flattened on homepage
 *   shelves: { droneWorld, droneCare, globalProducts },
 *   missions: { agri, city },
 *   testimonials: { eyebrow, title, titleAccent, lead, linkLabel, linkHref },
 *   about: { ... },
 *
 *   // v2 published + draft
 *   v2: HomepageCmsV2Content,
 *   draftV2: HomepageCmsV2Content | null,
 *
 *   // Post-modernization addition:
 *   draftV1: HomepageCmsContent | null  // mirrors shelves/missions/testimonials drafts
 * }
 *
 * Hero banners remain relational in public.hero_banners (status draft|published).
 * Footer lead lives at admin_settings.payload.footer (not under homepage).
 */
export const HOMEPAGE_ADMIN_SETTINGS_PAYLOAD_SNAPSHOT = {
  version: "cms-modernization-phase0",
  liveKeys: ["shelves", "missions", "testimonials", "about", "v2"] as const,
  draftKeys: ["draftV1", "draftV2"] as const,
  relationalHeroTable: "hero_banners",
  footerLeadKey: "footer"
} as const;
