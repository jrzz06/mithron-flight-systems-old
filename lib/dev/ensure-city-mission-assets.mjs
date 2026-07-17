import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const cityAssetMappings = [
  {
    sources: [
      "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_DRONELANCER_MODEL-8cd2bc63-3134-4303-ae2a-29b76ebb9eff.png",
      "DRONELANCER MODEL-8cd2bc63-3134-4303-ae2a-29b76ebb9eff.png"
    ],
    dest: "dronelancer-model.png"
  },
  {
    sources: [
      "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_CITY_DRONE_RENTAL_SERVICES_APP-ff6abdf6-eae2-40a0-85c7-ca8662ee0855.png",
      "CITY DRONE RENTAL SERVICES APP-ff6abdf6-eae2-40a0-85c7-ca8662ee0855.png"
    ],
    dest: "city-drone-rental-services-app.png"
  },
  {
    sources: [
      "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_DRONE_FRANCHISECARE_CENTER-3d4638c0-8876-40f5-b47a-d119b1be0077.png",
      "DRONE FRANCHISECARE CENTER-3d4638c0-8876-40f5-b47a-d119b1be0077.png"
    ],
    dest: "drone-franchisecare-center.png"
  },
  {
    sources: [
      "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_DRONE_TECHNICIAN_AGGREGATION-841abbc5-53f5-49b0-8fc8-e6b1bcf9e6e2.png",
      "DRONE TECHNICIAN AGGREGATION-841abbc5-53f5-49b0-8fc8-e6b1bcf9e6e2.png"
    ],
    dest: "drone-technician-aggregation.png"
  },
  {
    sources: [
      "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_All_Drone_Acadamic-e743ea91-99d4-4d32-aaba-6226ce80b1dc.png",
      "All Drone Acadamic-e743ea91-99d4-4d32-aaba-6226ce80b1dc.png"
    ],
    dest: "all-drone-acadamic.png"
  }
];

function assetSearchRoots() {
  const userProfile = process.env.USERPROFILE ?? process.env.HOME ?? "";
  return [
    join(userProfile, ".cursor", "projects", "d-mithuuu", "assets"),
    join(userProfile, ".cursor", "projects", "d-mithron", "assets"),
    join(
      userProfile,
      "AppData",
      "Roaming",
      "Cursor",
      "User",
      "workspaceStorage",
      "883dab95b7a4a2b2fab0ca7f2b0a5a39",
      "images"
    )
  ];
}

function resolveSourcePath(sources) {
  for (const root of assetSearchRoots()) {
    for (const source of sources) {
      const candidate = join(root, source);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

export function ensureCityMissionSourceImages() {
  const outputDir = join(projectRoot, "public", "media", "mithron", "mission", "city");
  mkdirSync(outputDir, { recursive: true });

  let installed = 0;
  for (const { sources, dest } of cityAssetMappings) {
    const destPath = join(outputDir, dest);
    if (existsSync(destPath)) continue;

    const sourcePath = resolveSourcePath(sources);
    if (!sourcePath) continue;

    copyFileSync(sourcePath, destPath);
    installed += 1;
    console.log(`installed ${dest}`);
  }

  return installed;
}
