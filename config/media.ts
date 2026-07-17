import type { CinematicMediaAsset } from "@/config/types";
import { storefrontMediaPaths } from "@/config/storefront-media-paths";

export const localMedia = {
  heroAg10Poster: {
    id: "hero-ag10-poster",
    src: storefrontMediaPaths.hero.ag10Command,
    alt: "Mithron AG10 sprayer drone floating over a cinematic smart-farming field",
    kind: "image",
    local: true,
    role: "hero",
    width: 1600,
    height: 900
  },
  heroAg10Loop: {
    id: "hero-ag10-loop",
    src: storefrontMediaPaths.hero.ag10Command,
    alt: "Mithron AG10 cinematic smart-farming hero scene",
    kind: "image",
    local: true,
    role: "hero",
    width: 1600,
    height: 900,
    poster: storefrontMediaPaths.hero.ag10Command
  },
  storyPrecisionSpray: {
    id: "story-precision-spray",
    src: storefrontMediaPaths.story.precisionSpray,
    alt: "Mithron precision spraying over crop rows",
    kind: "image",
    local: true,
    role: "story",
    width: 1200,
    height: 900
  },
  storyTerrainRadar: {
    id: "story-terrain-radar",
    src: storefrontMediaPaths.story.terrainRadar,
    alt: "Mithron terrain radar and obstacle avoidance visualization",
    kind: "image",
    local: true,
    role: "story",
    width: 1200,
    height: 900
  },
  storyMissionPlanning: {
    id: "story-mission-planning",
    src: storefrontMediaPaths.story.missionPlanning,
    alt: "Mithron autonomous mission planning and mapping workflow",
    kind: "image",
    local: true,
    role: "story",
    width: 1200,
    height: 900
  }
} satisfies Record<string, CinematicMediaAsset>;

export function getCriticalMediaManifest(): CinematicMediaAsset[] {
  return Object.values(localMedia);
}
