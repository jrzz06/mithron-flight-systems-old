import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin operational UX", () => {
  it("provides shared operational admin controls without changing persistence architecture", () => {
    const modulePanel = source("components/admin/module-panel.tsx");
    const submitButton = source("components/admin/operational-submit-button.tsx");
    const nav = source("components/platform/platform-nav.tsx");
    const frame = source("components/admin/admin-frame.tsx");
    const navConfig = source("components/platform/nav-config.ts");

    expect(modulePanel).toContain("export function StatusBadge");
    expect(modulePanel).toContain("export function OperationalRecordGrid");
    expect(modulePanel).toContain("export function OperationalFeedback");
    expect(submitButton).toContain("useFormStatus");
    expect(submitButton).toContain("busy?: boolean");
    expect(submitButton).toContain("aria-live=\"polite\"");
    expect(source("components/admin/operational-action-panel.tsx")).toContain("busy={isPending}");
    expect(source("components/admin/operational-action-panel.tsx")).toContain("notifyActionResult");
    expect(nav).toContain("usePathname");
    expect(nav).toContain("aria-current");
    expect(nav).toContain("/auth/logout");
    expect(frame).toContain("PlatformShell");
    expect(navConfig).toContain("Home");
    expect(navConfig).toContain("Dashboard");
    expect(navConfig).toContain("Catalog");
    expect(navConfig).toContain("Team");
    expect(navConfig).toContain("Users & access");
    expect(navConfig).toContain("/admin/audit");
    expect(frame).toContain("data-admin-shell");
    expect(frame).not.toContain('href: "/warehouse"');
    expect(nav).toContain("Sign out");
  });

  it("uses compact production admin primitives instead of marketing hero panels", () => {
    const modulePanel = source("components/admin/module-panel.tsx");
    const controlShell = source("components/admin/control-shell.tsx");
    const topbar = source("components/platform/platform-topbar.tsx");

    expect(modulePanel).toContain("export function AdminMetricGrid");
    expect(modulePanel).toContain("export function AdminSection");
    expect(modulePanel).toContain("export function AdminTableShell");
    expect(modulePanel).toContain("export function AdminFormSection");
    expect(modulePanel).toContain("export function AdminStickyActionFooter");
    expect(modulePanel).not.toContain("text-[clamp(2.4rem,5vw,5.2rem)]");
    expect(controlShell).toContain("data-control-shell-header");
    expect(controlShell).not.toContain("min-h-[calc(100vh-5rem)]");
    expect(topbar).toContain("data-admin-topbar");
    expect(topbar).toContain("data-admin-command-search");
    expect(topbar).not.toContain("/warehouse/shipments");
  });

  it("surfaces obvious admin CRUD entry points from the overview page", () => {
    const page = source("app/admin/page.tsx");

    expect(page).toContain("data-admin-kpi-strip");
    expect(page).toContain("Action queue");
    expect(page).toContain("Pending orders");
    expect(page).toContain("/admin/orders?queue=review");
    expect(page).toContain("Supplier approvals");
    expect(page).toContain("/admin/suppliers/products");
    expect(page).toContain("Customer enquiries");
    expect(page).toContain("/admin/enquiries");
    expect(page).not.toContain("data-admin-quick-actions");
    expect(page).not.toContain("Hard delete");
    expect(page).not.toContain("Open storefront");
  });

  it("replaces the admin overview hero with operational dashboard widgets", () => {
    const page = source("app/admin/page.tsx");
    const adminService = source("services/admin.ts");

    expect(page).toContain("data-admin-dashboard");
    expect(page).toContain("data-admin-kpi-strip");
    expect(page).toContain("Action queue");
    expect(page).toContain("Inventory alerts");
    expect(page).toContain("listAdminEnquiries");
    expect(page).toContain("pendingSupplierSubmissionRows");
    expect(page).not.toContain("data-admin-quick-actions");
    expect(page).not.toContain("Recent orders");
    expect(page).not.toContain("Recent activity");
    expect(page).not.toContain("Recent CMS changes");
    expect(page).not.toContain("Recent uploads");
    expect(page).not.toContain("Table counts");
    expect(page).not.toContain("Website control plane.");
    expect(page).not.toContain("Super admin command");
    expect(adminService).toContain("recentOrders");
    expect(adminService).toContain("recentNotifications");
    expect(adminService).toContain("recentActivity");
    expect(adminService).toContain("lowStockAlerts");
    expect(adminService).toContain("operationalCounts");
    expect(adminService).toContain("ordersNeedingReview");
    expect(adminService).toContain("listPendingSupplierSubmissions");
    expect(adminService).not.toContain("recentShipments");
    expect(adminService).not.toContain("pendingOperations");
  });

  it("makes product management searchable and status visible", () => {
    const page = source("app/admin/products/page.tsx");
    const grid = source("app/admin/products/product-catalog-grid.tsx");
    const dialog = source("app/admin/products/product-detail-edit-dialog.tsx");

    expect(page).toContain("data-product-search");
    expect(page).toContain("data-product-status-filter");
    expect(page).toContain("ProductCatalogGrid");
    expect(grid).toContain("data-product-operational-grid");
    expect(grid).toContain("data-product-stock-visibility");
    expect(page).toContain("data-product-tool-dock");
    expect(page).toContain("activeTool === \"create\"");
    expect(page).toContain("activeTool === \"variants\"");
    expect(page).toContain("activeTool === \"seo\"");
    expect(page).toContain("activeTool === \"publish\"");
    expect(page).toContain("activeTool === \"inventory\"");
    expect(page).toContain("activeTool === \"media\"");
    expect(page).toContain("id=\"create-product\"");
    expect(page).toContain("data-product-add-action");
    expect(page).toContain("data-product-add-category-shortcut");
    expect(page).toContain("tool=category#product-category");
    expect(page).toContain("activeTool === \"category\"");
    expect(page).toContain("data-product-create-toolbar");
    expect(page).toContain("data-product-create-panel");
    expect(page).toContain("ProductCreateDetailFields");
    expect(source("app/admin/products/product-create-detail-fields.tsx")).toContain("data-product-create-detail-fields");
    expect(page).toContain("data-product-create-media-fields");
    expect(page).toContain("data-product-create-submit-bar");
    expect(page).toContain("data-product-category-create-panel");
    expect(page).toContain("data-product-category-name-input");
    expect(page).toContain("data-product-category-route-input");
    expect(page).toContain("data-product-category-submit-bar");
    expect(page).toContain("ProductCategoryField");
    expect(page).toContain("buildProductCategoryOptions");
    expect(page).toContain("snapshot.data.categories");
    expect(page).toContain("saveProductCategoryFormAction");
    expect(page).toContain("deleteProductCategoryFormAction");
    expect(page).toContain("ProductMultiImageField");
    const multiImageField = readFileSync(join(process.cwd(), "components/products/product-multi-image-field.tsx"), "utf8");
    expect(multiImageField).toContain('name="image_files"');
    expect(multiImageField).toContain("multiple");
    expect(page).toContain("data-product-supabase-storage-note");
    expect(page).toContain("mithron-products Storage bucket");
    expect(page).toContain("platformToolClass");
    expect(page).toContain("text-[var(--platform-text-primary)]");
    expect(page).not.toContain("border-slate-900 bg-slate-950 text-white");
    expect(grid).toContain("ProductDetailEditDialog");
    expect(dialog).toContain("id=\"update-product\"");
    expect(dialog).toContain("data-product-quick-edit");
    expect(dialog).toContain("data-product-detail-modal");
    expect(dialog).toContain("Edit product");
    expect(dialog).toContain("Save changes");
    expect(dialog).toContain("name=\"product_slug\" value={product.id}");
    expect(dialog).toContain("type=\"hidden\" name=\"change_summary\"");
    expect(page).toContain("id=\"publish-product\"");
    expect(page).toContain("id=\"product-media\"");
    expect(grid).toContain("Pencil");
    expect(grid).toContain("aria-label={`Edit ${product.title}`}");
    expect(grid).toContain("title=\"Edit product\"");
    expect(grid).toContain('data-product-row-action={isArchivedView ? "permanent-delete" : "remove"}');
    expect(grid).toContain("data-product-row-actions-menu");
    expect(grid).toContain("grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px]");
    expect(grid).toContain("grid grid-cols-2 gap-1.5");
    expect(grid).toContain("menuOpen ? \"z-40\" : \"z-0\"");
    expect(grid).toContain("top-[calc(100%+0.375rem)] z-[90]");
    expect(grid).toContain("Remove");
    expect(grid).toContain("Permanent delete");
    expect(grid).toContain("saveProductRemoveFormAction");
    expect(grid).toContain("previewProductDeleteAction");
    expect(grid).toContain("grid-cols-1 md:grid-cols-2 xl:grid-cols-4");
    expect(grid).toContain("data-product-card");
    expect(grid).toContain("data-product-delete-modal");
    expect(grid).toContain("loading=\"lazy\"");
    expect(grid).toContain("saveProductDuplicateFormAction");
    expect(grid).toContain("Archive");
    expect(grid).toContain("Publish");
    expect(grid).toContain("Unpublish");
    expect(page).not.toContain("Hard delete");
    expect(page).not.toContain("data-product-row-action=\"hard-delete\"");
    expect(page).not.toContain("hard-delete-product");
    expect(page).toContain("OperationalSubmitButton");
    expect(page).toContain("OperationalFeedback");
    expect(page).toContain("product_action");
    expect(page).toContain("Product remove");
    const categoryField = source("components/products/product-category-field.tsx");
    expect(categoryField).toContain("data-product-category-field");
    expect(categoryField).toContain("data-product-delete-category-action");
    expect(categoryField).toContain("data-product-category-usage");
    expect(categoryField).toContain("name=\"category\"");
    expect(categoryField).toContain("name=\"category_route_key\"");
    expect(categoryField).not.toContain("data-product-add-category-action");
    expect(categoryField).not.toContain("startAddingCategory");
    expect(categoryField).not.toContain("data-product-new-category-panel");
    expect(categoryField).not.toContain("name=\"new_category\"");
    expect(categoryField).not.toContain("name=\"category_mode\"");
    expect(categoryField).toContain("formAction={deleteCategoryAction}");
  });

  it("adds operational dashboards for inventory and orders", () => {
    const fulfillmentPage = source("app/warehouse/fulfillment/page.tsx");
    const adminInventoryPage = source("app/admin/inventory/page.tsx");
    const inventoryManager = source("components/admin/inventory-manager.tsx");
    const ordersPage = source("app/admin/orders/page.tsx");
    const ordersWorkspace = source("components/admin/admin-orders-workspace.tsx");
    const ordersShell = source("components/admin/orders/admin-orders-shell.tsx");
    const ordersToolbar = source("components/admin/orders/admin-orders-toolbar.tsx");
    const ordersCreateDrawer = source("components/admin/orders/admin-order-create-drawer.tsx");
    const ordersActionsRail = source("components/admin/orders/admin-order-actions-rail.tsx");
    const ordersTimeline = source("components/admin/orders/admin-order-timeline.tsx");
    const ordersDetailPanel = source("components/admin/orders/admin-order-detail-panel.tsx");
    const ordersPrimitives = source("components/admin/orders/order-detail-primitives.tsx");
    const ordersFilterBar = source("components/admin/orders/admin-orders-filter-bar.tsx");
    const ordersHelpers = source("components/admin/orders/order-view-helpers.ts");
    const ordersUi = `${ordersPage}\n${ordersWorkspace}\n${ordersShell}\n${ordersToolbar}\n${ordersFilterBar}\n${ordersHelpers}\n${ordersCreateDrawer}\n${ordersActionsRail}\n${ordersTimeline}\n${ordersDetailPanel}\n${ordersPrimitives}`;

    expect(ordersUi).toContain("data-order-status-board");
    expect(ordersUi).toContain("data-order-timeline");
    expect(ordersUi).toContain("data-order-transition-feedback");
    expect(ordersUi).toContain("data-admin-orders-shell");
    expect(ordersUi).toContain("data-admin-order-create-drawer");
    expect(ordersUi).toContain("ADMIN_ORDERS_VIEW_TABS");
    expect(ordersUi).toContain('label: "Later"');
    expect(ordersUi).toContain("Create order");
    expect(ordersUi).not.toContain("data-admin-orders-kpi-strip");
    expect(ordersUi).toContain("data-admin-order-detail-panel");
    expect(ordersUi).toContain("data-order-detail-panel");
    expect(ordersUi).toContain("OperationalSubmitButton");

    expect(fulfillmentPage).toContain("data-warehouse-fulfillment-route");
    expect(fulfillmentPage).toContain("getWarehouseSnapshot");
    expect(adminInventoryPage).toContain("InventoryManager");
    expect(adminInventoryPage).toContain("getCsvInventoryRows");
    expect(adminInventoryPage).not.toContain("repairMissingProductInventory");
    expect(adminInventoryPage).not.toContain("syncMissingInventoryAction");
    expect(adminInventoryPage).toContain("totalProductCount");
    expect(adminInventoryPage).not.toContain("getWarehouseSnapshot");
    expect(inventoryManager).toContain("data-inventory-system");
    expect(inventoryManager).toContain("data-inventory-row");
    expect(inventoryManager).toContain("data-advanced-warehouse-details");
    expect(inventoryManager).toContain("Adjust stock");
    expect(inventoryManager).toContain("OperationalSubmitButton");
  });

  it("keeps product media operations visible and retry-safe", () => {
    const productsPage = source("app/admin/products/page.tsx");

    expect(productsPage).toContain("ProductMultiImageField");
    expect(productsPage).toContain("id=\"product-media\"");
    expect(productsPage).toContain("OperationalFeedback");
  });

  it("surfaces global operator feedback across admin and role shells", () => {
    const toastBridge = source("components/admin/operator-toast-bridge.tsx");
    const frame = source("components/admin/admin-frame.tsx");
    const shell = source("components/platform/platform-shell.tsx");
    const controlShell = source("components/admin/control-shell.tsx");
    const modulePanel = source("components/admin/module-panel.tsx");

    expect(toastBridge).toContain("toast.success");
    expect(toastBridge).toContain("toast.error");
    expect(toastBridge).toContain("toast.warning");
    expect(toastBridge).toContain("useRouter");
    expect(toastBridge).toContain("router.replace");
    expect(toastBridge).toContain("cleanedParams.delete(statusKey)");
    expect(toastBridge).toContain("cleanedParams.delete(messageKeyFor(statusKey))");
    expect(frame).toContain("PlatformShell");
    expect(shell).toContain("OperatorToastBridge");
    expect(controlShell).toContain("data-operator-state-strip");
    expect(modulePanel).toContain("export function OperationalStateStrip");
  });

  it("keeps storefront chrome out of admin and role control-plane routes", () => {
    const shell = source("components/layout/storefront-shell-streaming.tsx");
    const routes = source("lib/ui/shell-routes.ts");

    expect(shell).toContain("shouldSkipStorefrontChrome");
    expect(routes).toContain("pathname.startsWith(\"/admin/\")");
    expect(routes).toContain("pathname.startsWith(\"/warehouse/\")");
    expect(routes).toContain("pathname.startsWith(\"/operations/\")");
    expect(routes).toContain("pathname.startsWith(\"/supplier/\")");
    expect(shell).toContain("if (skipsStorefrontChrome)");
  });

  it("keeps storefront chrome off auth entry routes so login controls stay clickable", () => {
    const shell = source("components/layout/storefront-shell-streaming.tsx");
    const routes = source("lib/ui/shell-routes.ts");

    expect(routes).toContain("isAuthEntryRoute");
    expect(routes).toContain('pathname === "/login"');
    expect(routes).toContain('pathname === "/signup"');
    expect(routes).toContain('pathname.startsWith("/invite/")');
    expect(shell).toContain("shouldSkipStorefrontChrome(pathname)");
  });

  it("matures warehouse sibling pages with lifecycle visibility and pending submit states", () => {
    const ordersPage = source("app/warehouse/orders/page.tsx");
    const fulfillmentPage = source("app/warehouse/fulfillment/page.tsx");
    const fulfillmentDetailPage = source("app/warehouse/fulfillment/[id]/page.tsx");
    const activityPage = source("app/warehouse/activity/page.tsx");

    expect(ordersPage).toContain("OperationalFeedback");
    expect(ordersPage).toContain("WarehouseOrderQueueTable");
    expect(fulfillmentPage).toContain("data-warehouse-fulfillment-route");
    expect(fulfillmentDetailPage).toContain("WarehouseFulfillmentDetail");
    expect(activityPage).toContain("Dispatch History");
  });

  it("keeps the default admin chrome focused on admin and warehouse work", () => {
    const frame = source("components/admin/admin-frame.tsx");
    const navConfig = source("components/platform/nav-config.ts");
    const page = source("app/admin/page.tsx");

    expect(frame).not.toContain('href: "/warehouse"');
    expect(navConfig).toContain('href: "/operations"');
    expect(page).not.toContain("Operations tasks");
    expect(page).not.toContain("Shipment workflow");
  });
});

