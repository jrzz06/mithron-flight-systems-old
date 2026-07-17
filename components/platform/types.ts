export type PlatformNavIconKey =
  | "dashboard"
  | "products"
  | "orders"
  | "inventory"
  | "media"
  | "cms"
  | "users"
  | "settings"
  | "operations"
  | "reports"
  | "suppliers"
  | "enquiries"
  | "audit"
  | "gauge"
  | "truck"
  | "fulfillment"
  | "history"
  | "returns";

export type PlatformNavItem = {
  label: string;
  href: string;
  icon?: PlatformNavIconKey;
  badgeCount?: number;
};

export type PlatformNavGroup = {
  label: string;
  items: PlatformNavItem[];
  defaultCollapsed?: boolean;
};

export type PlatformScope = "admin" | "warehouse" | "supplier" | "operations";

export type PlatformSearchItem = {
  label: string;
  href: string;
  group: string;
};

export type PlatformRouteTitle = {
  href: string;
  title: string;
  kicker: string;
};
