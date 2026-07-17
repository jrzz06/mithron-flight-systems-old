import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const assetMappings = [
  {
    sources: [
      "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_AGRONE_Drone_Owner_Registration-db1efac5-9b63-451a-833b-96cb101b9e14.png",
      "AGRONE Drone Owner Registration-db1efac5-9b63-451a-833b-96cb101b9e14.png"
    ],
    dest: "agrone-drone-owner-registration.png"
  },
  {
    sources: [
      "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_AGRONE_Pilot_Registration-b1390ed6-2668-4d0c-94cb-5ee8cd9d65c4.png",
      "AGRONE Pilot Registration-b1390ed6-2668-4d0c-94cb-5ee8cd9d65c4.png"
    ],
    dest: "agrone-pilot-registration.png"
  },
  {
    sources: [
      "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_All_India_Drone_Farmer-f9f63648-8ccc-4567-abe8-5f9d4d83e875.png",
      "All India Drone Farmer-f9f63648-8ccc-4567-abe8-5f9d4d83e875.png"
    ],
    dest: "all-india-drone-farmer.png"
  },
  {
    sources: [
      "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_SmartFarmerregister-62c4ea9e-94b0-40cd-b044-540782775fbf.png",
      "SmartFarmerregister-62c4ea9e-94b0-40cd-b044-540782775fbf.png"
    ],
    dest: "smart-farmer-register.png"
  },
  {
    sources: [
      "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_Agri_Drone_Loan-3bfdbd72-0076-4821-8000-8f8ec68f88c8.png",
      "Agri Drone Loan-3bfdbd72-0076-4821-8000-8f8ec68f88c8.png"
    ],
    dest: "agri-drone-loan.png"
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

export function ensureAgroneSourceImages({ force = false } = {}) {
  const outputDir = join(projectRoot, "public", "media", "mithron", "mission", "agrone");
  mkdirSync(outputDir, { recursive: true });

  let installed = 0;
  for (const { sources, dest } of assetMappings) {
    const destPath = join(outputDir, dest);
    const sourcePath = resolveSourcePath(sources);
    if (!sourcePath) continue;
    if (existsSync(destPath) && !force) continue;

    copyFileSync(sourcePath, destPath);
    installed += 1;
    console.log(`installed ${dest}`);
  }

  return installed;
}
