import type { PlatformNavGroup, PlatformRouteTitle, PlatformSearchItem, PlatformNavIconKey } from "@/components/platform/types";
import type { AdminSection, CmsRole } from "@/lib/auth/access-control";
import { canAccessAdminSection } from "@/lib/auth/access-control";

type AdminNavItemDef = {
  label: string;
  href: string;
  section: AdminSection;
  icon: PlatformNavIconKey;
  badgeCount?: number;
};

type AdminNavGroupDef = {
  label: string;
  defaultCollapsed?: boolean;
  items: AdminNavItemDef[];
};

const adminNavGroups: AdminNavGroupDef[] = [
  {
    label: "Home",
    items: [{ label: "Dashboard", href: "/admin", section: "overview", icon: "dashboard" }]
  },
  {
    label: "Catalog",
    items: [
      { label: "Products", href: "/admin/products#product-list", section: "products", icon: "products" },
      { label: "Inventory", href: "/admin/inventory", section: "warehouse", icon: "inventory" }
    ]
  },
  {
    label: "Fulfillment",
    items: [
      { label: "Orders", href: "/admin/orders", section: "orders", icon: "orders" },
      { label: "Contact Requests", href: "/admin/contact-requests", section: "enquiries", icon: "enquiries" },
      { label: "Enquiries", href: "/admin/enquiries", section: "enquiries", icon: "enquiries" }
    ]
  },
  {
    label: "Partners",
    items: [
      { label: "Suppliers", href: "/admin/suppliers", section: "suppliers", icon: "suppliers" },
      { label: "Submissions", href: "/admin/suppliers/products", section: "suppliers", icon: "products" }
    ]
  },
  {
    label: "Content",
    items: [
      { label: "Website", href: "/admin/cms", section: "cms", icon: "cms" },
      { label: "Articles", href: "/admin/blog", section: "cms", icon: "cms" },
      { label: "Media", href: "/admin/media", section: "cms", icon: "cms" },
      { label: "Reviews", href: "/admin/reviews", section: "enquiries", icon: "enquiries" }
    ]
  },
  {
    label: "System",
    defaultCollapsed: true,
    items: [
      { label: "Warehouses", href: "/admin/warehouses", section: "warehouse", icon: "inventory" },
      { label: "Users", href: "/admin/users", section: "overview", icon: "operations" },
      { label: "Operations", href: "/operations", section: "operations", icon: "operations" },
      { label: "Archives", href: "/admin/archives", section: "audit", icon: "audit" },
      { label: "System Diagnostics", href: "/admin/audit", section: "audit", icon: "audit" }
    ]
  }
];

export function buildAdminNavGroups(role: CmsRole | null, pendingSupplierApprovals = 0): PlatformNavGroup[] {
  return adminNavGroups
    .map((group) => ({
      label: group.label,
      defaultCollapsed: group.defaultCollapsed,
      items: group.items
        .filter((item) => Boolean(role && canAccessAdminSection(role, item.section)))
        .map((item) => ({
          label: item.label,
          href: item.href,
          icon: item.icon,
          badgeCount: item.href === "/admin/suppliers/products" ? pendingSupplierApprovals : item.badgeCount
        }))
    }))
    .filter((group) => group.items.length > 0);
}

export function buildAdminSearchItems(groups: PlatformNavGroup[]): PlatformSearchItem[] {
  return groups.flatMap((group) => group.items.map((item) => ({ label: item.label, href: item.href, group: group.label })));
}

export const adminRouteTitles: PlatformRouteTitle[] = [
  { href: "/admin/products", title: "Products", kicker: "Catalog" },
  { href: "/admin/orders", title: "Orders", kicker: "Fulfillment" },
  { href: "/admin/contact-requests", title: "Contact Requests", kicker: "Fulfillment" },
  { href: "/admin/reviews", title: "Reviews", kicker: "Content" },
  { href: "/admin/inventory", title: "Inventory", kicker: "Catalog" },
  { href: "/admin/cms", title: "Website", kicker: "Content" },
  { href: "/admin/blog", title: "Articles", kicker: "Content" },
  { href: "/admin/press", title: "Articles", kicker: "Content" },
  { href: "/admin/suppliers", title: "Suppliers", kicker: "Partners" },
  { href: "/admin/suppliers/products", title: "Submissions", kicker: "Partners" },
  { href: "/admin/enquiries", title: "Enquiries", kicker: "Partners" },
  { href: "/admin/audit", title: "System Diagnostics", kicker: "System" },
  { href: "/admin/users", title: "Users", kicker: "System" },
  { href: "/admin/warehouses", title: "Warehouses", kicker: "Fulfillment" },
  { href: "/operations", title: "Operations", kicker: "System" },
  { href: "/operations/deployments", title: "Field requests", kicker: "System" },
  { href: "/operations/tasks", title: "Tasks", kicker: "System" },
  { href: "/operations/notifications", title: "Notifications", kicker: "System" },
  { href: "/operations/orders", title: "Orders", kicker: "Fulfillment" },
  { href: "/admin", title: "Dashboard", kicker: "Home" }
];

export const warehouseNavGroups: PlatformNavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Today", href: "/warehouse/dashboard", icon: "gauge" },
      { label: "Orders", href: "/warehouse/orders", icon: "orders" },
      { label: "Fulfillment", href: "/warehouse/fulfillment", icon: "orders" },
      { label: "History", href: "/warehouse/activity", icon: "audit" }
    ]
  }
];

export const supplierNavGroups: PlatformNavGroup[] = [
  {
    label: "Supplier",
    items: [
      { label: "Home", href: "/supplier", icon: "gauge" },
      { label: "My products", href: "/supplier/products", icon: "products" },
      { label: "Review status", href: "/supplier/submissions", icon: "enquiries" },
      { label: "Stock levels", href: "/supplier/inventory", icon: "inventory" }
    ]
  }
];

export const warehouseRouteTitles: PlatformRouteTitle[] = [
  { href: "/warehouse/dashboard", title: "Today's Operations", kicker: "Dashboard" },
  { href: "/warehouse/orders", title: "Orders", kicker: "Orders" },
  { href: "/warehouse/fulfillment", title: "Fulfillment", kicker: "Fulfillment" },
  { href: "/warehouse/fulfillment/[id]", title: "Fulfillment", kicker: "Fulfillment" },
  { href: "/warehouse/activity", title: "Dispatch History", kicker: "History" }
];

export const supplierRouteTitles: PlatformRouteTitle[] = [
  { href: "/supplier", title: "Home", kicker: "Supplier" },
  { href: "/supplier/products/new", title: "Add product", kicker: "Supplier" },
  { href: "/supplier/products", title: "My products", kicker: "Supplier" },
  { href: "/supplier/submissions", title: "Review status", kicker: "Supplier" },
  { href: "/supplier/inventory", title: "Stock levels", kicker: "Supplier" }
];
