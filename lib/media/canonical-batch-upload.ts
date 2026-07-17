import { uploadMithronAssets, type UploadMithronAssetsResult } from "@/lib/mithron-assets/upload-service";

export type CanonicalBatchUploadOptions = {
  dryRun?: boolean;
  limit?: number;
  mastersDir?: string;
};

export type CanonicalBatchUploadResult = UploadMithronAssetsResult & {
  manifestRegenDeferred: true;
  canonicalTarget: "media_assets";
};

export async function runCanonicalBatchUpload(
  options: CanonicalBatchUploadOptions = {}
): Promise<CanonicalBatchUploadResult> {
  const result = await uploadMithronAssets({
    dryRun: options.dryRun,
    limit: options.limit,
    mastersDir: options.mastersDir,
    skipManifestWrite: true
  });

  return {
    ...result,
    manifestRegenDeferred: true,
    canonicalTarget: "media_assets"
  };
}

export function isUploadApiRetired(env: Record<string, string | undefined> = process.env) {
  return env.MITHRON_UPLOAD_API_RETIRED === "true";
}
