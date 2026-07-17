export type PressPublishStatus = "draft" | "published" | "archived";

export type PressCoverImage = {
  url: string;
  alt?: string;
  mediaAssetId?: string | null;
};

export type PressCoverageItem = {
  id: string;
  publisher: string;
  title: string;
  description: string;
  cover_image: PressCoverImage;
  external_url: string;
  sort_order: number;
  is_featured: boolean;
  status: PressPublishStatus;
  is_visible: boolean;
  published_at: string | null;
  archived_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PressCoverageInput = {
  publisher?: string | null;
  title?: string | null;
  description?: string | null;
  coverImage?: PressCoverImage | null;
  externalUrl?: string | null;
  sortOrder?: number | null;
  isFeatured?: boolean;
  status?: PressPublishStatus;
};

export function pressCtaLabel(publisher: string) {
  const normalized = publisher.trim().toUpperCase();
  if (normalized === "YOURSTORY") return "Read on YourStory →";
  if (normalized === "CIO TECH OUTLOOK") return "Read on CIO Tech Outlook →";
  if (normalized === "TRACXN") return "View on Tracxn →";
  return `Read on ${publisher.trim()} →`;
}
