import type { JSONContent } from "@tiptap/core";

export type SupplierWorkflowStatus = "draft" | "pending_review" | "published" | "rejected";

export type SupplierProduct = {
  slug: string;
  name: string;
  category: string;
  price: number;
  tagline?: string;
  workflowStatus: SupplierWorkflowStatus;
  rejectionReason?: string | null;
  isVisible: boolean;
  specs?: Record<string, string> | null;
  description?: string | null;
  descriptionJson?: string | JSONContent | null;
  imageSrc?: string;
  imageAlt?: string;
  hero?: string;
  galleryUrls?: string[];
  updatedAt?: string | null;
};

export type SupplierInventoryItem = {
  id: string;
  productSlug: string;
  productName: string;
  sku: string;
  stockStatus: string;
  quantity: number;
  reorderThreshold: number;
  updatedAt: string;
};

export type SupplierProductFormState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: Record<string, string>;
  debug?: Array<{ label: string; value: string }>;
};

export type SupplierProductEditDefaults = {
  slug: string;
  name: string;
  category: string;
  price: number;
  description?: string;
  descriptionJson?: string | JSONContent;
  specs?: Record<string, string> | null;
  imageSrc?: string;
  imageAlt?: string;
  galleryUrls?: string[];
  updatedAt?: string | null;
};
