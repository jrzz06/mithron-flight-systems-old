import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const catalogShowcaseAssetMappings = [
  {
    sources: [
      "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_gLOBAL_PRODUCT-6e3a7f2f-465e-461d-9a0a-a4557e53d4fc.png",
      "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_gLOBAL_PRODUCT-d4491ea6-b750-4ac1-8a8a-dcb85da17e49.png",
      "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_gLOBAL_PRODUCT-cdab380f-25e3-4d19-8a50-7eacfc790f21.png"
    ],
    dest: "global-products-category.png"
  }
];

function assetSearchRoots() {
  const userProfile = process.env.USERPROFILE ?? process.env.HOME ?? "";
  return [
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
  const candidates = Array.isArray(sources) ? sources : [sources];
  for (const source of candidates) {
    for (const root of assetSearchRoots()) {
      const candidate = join(root, source);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

export function ensureCatalogShowcaseAssets({ force = true } = {}) {
  const outputDir = join(projectRoot, "public", "media", "mithron", "catalog");
  mkdirSync(outputDir, { recursive: true });

  let installed = 0;
  for (const { sources, dest } of catalogShowcaseAssetMappings) {
    const destPath = join(outputDir, dest);
    if (!force && existsSync(destPath)) continue;

    const sourcePath = resolveSourcePath(sources);
    if (!sourcePath) continue;

    copyFileSync(sourcePath, destPath);
    installed += 1;
    console.log(`installed ${dest}`);
  }

  return installed;
}
