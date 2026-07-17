import type { MithronAssetFormat } from "@/config/types";

export type MediaDeliveryRole = "thumb" | "card" | "shelf" | "hero";

export type MediaDeliveryProfile = {
  maxVariantWidth: number;
  preferredFormat: MithronAssetFormat;
  webpOnly: boolean;
};

export const mediaDeliveryProfiles = {
  thumb: { maxVariantWidth: 384, preferredFormat: "webp", webpOnly: true },
  card: { maxVariantWidth: 768, preferredFormat: "webp", webpOnly: true },
  shelf: { maxVariantWidth: 1536, preferredFormat: "webp", webpOnly: true },
  hero: { maxVariantWidth: 1920, preferredFormat: "webp", webpOnly: false }
} as const satisfies Record<MediaDeliveryRole, MediaDeliveryProfile>;

export const missionTileMaxWidths = {
  hero: 1280,
  wide: 1280,
  tall: 1024,
  standard: 768
} as const;

export type MissionTileCardType = keyof typeof missionTileMaxWidths;

export function getMediaDeliveryProfile(role: MediaDeliveryRole): MediaDeliveryProfile {
  return mediaDeliveryProfiles[role];
}
