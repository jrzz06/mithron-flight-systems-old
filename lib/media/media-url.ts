export const MEDIA_VARIANT_WIDTHS = {
  thumbnail: 320,
  medium: 960,
  large: 1600,
  xlarge: 2560,
  ultra: 3840
} as const;

export function buildSupabasePublicObjectUrl(baseUrl: string, bucket: string, storagePath: string) {
  return `${baseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;
}
