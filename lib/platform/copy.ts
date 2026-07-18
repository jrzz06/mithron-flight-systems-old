const STATUS_LABELS: Record<string, string> = {
  live: "All systems ready",
  partial: "Some data unavailable",
  blocked: "Temporarily unavailable",
  pending: "Awaiting review",
  pending_review: "Awaiting review",
  pending_payment: "Awaiting payment",
  admin_review: "Under review",
  paid: "Payment received",
  confirmed: "Confirmed",
  assigned: "Assigned to warehouse",
  draft: "Draft",
  published: "Live on store",
  approved: "Live on store",
  archived: "Removed from store",
  available: "In stock",
  processing: "Processing",
  packed: "Packed",
  packing: "Packing",
  dispatched: "Dispatched",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  discontinued: "Discontinued",
  reserved: "Reserved",
  inactive: "Inactive",
  hidden: "Hidden",
  open: "Open",
  closed: "Closed",
  unread: "Unread",
  read: "Read",
  success: "Complete",
  error: "Failed",
  warning: "Needs attention",
  rejected: "Changes requested",
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  lost: "Closed",
  won: "Won",
  create: "",
  rbac: "",
  cms: "",
  media: "",
  orders: "",
  protected: ""
};

const SUPPLIER_EMPTY_MESSAGES: Record<string, string> = {
  products: "You have not added any products yet. Start by creating your first listing.",
  inventory: "Stock levels will appear here once your products are linked to warehouse inventory.",
  submissions: "Products you send for review will appear here.",
  attention: "Nothing needs your attention right now.",
  awaiting: "No products are currently awaiting review.",
  changes: "No products need changes at the moment.",
  recent: "No products are live on the store yet.",
  stock: "Stock information is not available yet.",
  default: "Nothing to show yet."
};

const SUPPLIER_STATUS_HINTS: Record<string, string> = {
  draft: "Not sent for review yet — save your work, then send for review.",
  pending_review: "Waiting for our team to review your submission.",
  rejected: "Our team has requested changes — update and resubmit.",
  published: "This product is live on the store.",
  archived: "This product has been removed from the store."
};

const EMPTY_MESSAGES: Record<string, string> = {
  orders: "No orders yet. New orders will appear here.",
  products: "No products found. Create your first product to get started.",
  inventory: "Inventory is clear. No low-stock items right now.",
  activity: "No recent activity to show.",
  notifications: "You're all caught up.",
  media: "No media assets yet. Upload files to build your library.",
  suppliers: "No supplier accounts yet.",
  enquiries: "No enquiries in the queue.",
  default: "Nothing to show yet."
};

export function humanStatus(status: string): string {
  const normalized = status.toLowerCase().trim();
  if (STATUS_LABELS[normalized] !== undefined) return STATUS_LABELS[normalized];
  return status.replaceAll("_", " ");
}

export function snapshotStatusLabel(status: "LIVE" | "PARTIAL" | "BLOCKED" | string): string {
  const normalized = status.toUpperCase();
  if (normalized === "LIVE") return "All systems ready";
  if (normalized === "PARTIAL") return "Some data unavailable";
  if (normalized === "BLOCKED") return "Temporarily unavailable";
  return humanStatus(status);
}

export function connectivityMessage(blockedReason?: string | null): string {
  if (!blockedReason) return "";
  if (/table|mithron_|supabase|env|missing/i.test(blockedReason)) {
    return "We couldn't load this data. Check your connection or contact support.";
  }
  return blockedReason;
}

export function emptyMessage(context: string): string {
  return EMPTY_MESSAGES[context] ?? EMPTY_MESSAGES.default;
}

export function supplierEmptyMessage(context: string): string {
  return SUPPLIER_EMPTY_MESSAGES[context] ?? SUPPLIER_EMPTY_MESSAGES.default;
}

export function supplierStatusHint(status: string): string {
  const normalized = status.toLowerCase().trim();
  return SUPPLIER_STATUS_HINTS[normalized] ?? "";
}

export function supplierRejectionLabel(): string {
  return "What to change";
}

export function supplierStatusExplanation(status: string): string {
  const normalized = status.toLowerCase().trim();
  if (normalized === "pending_review") {
    return "You cannot edit this product while it is being reviewed.";
  }
  if (normalized === "published") {
    return "This product is live on the store. Contact us if you need changes.";
  }
  if (normalized === "archived") {
    return "This product has been removed from the store.";
  }
  return `This product is ${humanStatus(status).toLowerCase()} and cannot be edited here.`;
}

export function relativeTimeLabel(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  // Fixed locale + timezone so Node SSR and browser hydration never diverge on absolute dates.
  return date.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Kolkata"
  });
}
