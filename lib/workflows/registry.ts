import { getRolePermissions } from "@/lib/auth/permissions";
import type { RoleWorkflow, WorkflowRole } from "./types";

const customerOrderTransitions = [
  { from: "draft", to: "pending_payment", action: "checkout.start", actor: "user" as const },
  { from: "pending_payment", to: "paid", action: "payment.succeeded", actor: "user" as const },
  { from: "paid", to: "confirmed", action: "order.confirm", actor: "admin" as const },
  { from: "confirmed", to: "assigned", action: "warehouse.assign", actor: "warehouse" as const },
  { from: "assigned", to: "processing", action: "warehouse.allocate", actor: "warehouse" as const },
  { from: "processing", to: "packed", action: "warehouse.pack", actor: "warehouse" as const },
  { from: "packed", to: "dispatched", action: "warehouse.dispatch", actor: "warehouse" as const },
  { from: "dispatched", to: "in_transit", action: "shipment.in_transit", actor: "warehouse" as const },
  { from: "in_transit", to: "delivered", action: "shipment.delivered", actor: "warehouse" as const },
  { from: "delivered", to: "refunded", action: "payment.refunded", actor: "admin" as const }
];

const supplierProductTransitions = [
  { from: "draft", to: "pending_review", action: "product.submit", actor: "supplier" as const },
  { from: "pending_review", to: "published", action: "product.approve", actor: "admin" as const },
  { from: "pending_review", to: "rejected", action: "product.reject", actor: "admin" as const },
  { from: "rejected", to: "draft", action: "product.revise", actor: "supplier" as const }
];

export const ROLE_WORKFLOWS: Record<WorkflowRole, RoleWorkflow> = {
  user: {
    role: "user",
    label: "Customer",
    responsibilities: [
      "Browse catalog and manage cart",
      "Complete checkout and payment",
      "Track orders (account or guest lookup)",
      "Submit reviews after delivery"
    ],
    permissions: getRolePermissions("user"),
    pages: [
      { path: "/", label: "Storefront", description: "Browse products and categories" },
      { path: "/cart", label: "Cart", description: "Review line items before checkout" },
      { path: "/checkout", label: "Checkout", description: "Place order and pay" },
      { path: "/track-order", label: "Track order", description: "Guest or signed-in order lookup" },
      { path: "/account/orders", label: "Orders", description: "Order history and detail" },
      { path: "/account/addresses", label: "Addresses", description: "Shipping addresses" },
      { path: "/account/enquiries", label: "Enquiries", description: "Pre-sales questions" }
    ],
    actions: [
      { id: "cart.add", label: "Add to cart", permission: "orders.checkout", auditEvent: "cart.item_added" },
      { id: "checkout.place", label: "Place order", permission: "orders.checkout", auditEvent: "order.checkout_started", notification: "order.placed" },
      { id: "payment.complete", label: "Complete payment", permission: "payments.write", auditEvent: "payment.succeeded", notification: "payment.received" },
      { id: "order.track", label: "Track order", permission: "self", auditEvent: "order.tracked" },
      { id: "review.submit", label: "Submit review", permission: "self", auditEvent: "review.submitted", notification: "review.pending" }
    ],
    stateMachines: {
      order: {
        states: ["draft", "pending_payment", "paid", "confirmed", "assigned", "processing", "packed", "dispatched", "in_transit", "delivered", "refunded"],
        transitions: customerOrderTransitions
      },
      customer_review: {
        states: ["pending", "published", "rejected"],
        transitions: [
          { from: "pending", to: "published", action: "review.approve", actor: "admin" },
          { from: "pending", to: "rejected", action: "review.reject", actor: "admin" }
        ]
      }
    }
  },
  admin: {
    role: "admin",
    label: "Admin",
    responsibilities: [
      "Govern catalog, CMS, users, and settings",
      "Approve supplier products",
      "Oversee orders, inventory, and reports",
      "Moderate customer reviews and handle refunds"
    ],
    permissions: getRolePermissions("admin"),
    pages: [
      { path: "/admin", label: "Dashboard", description: "Operational overview" },
      { path: "/admin/products", label: "Products", description: "Catalog management" },
      { path: "/admin/inventory", label: "Inventory", description: "Stock levels and adjustments" },
      { path: "/admin/orders", label: "Orders", description: "Order lifecycle" },
      { path: "/admin/suppliers", label: "Suppliers", description: "Supplier approvals" },
      { path: "/admin/leads", label: "Leads", description: "Customer leads" },
      { path: "/admin/cms", label: "CMS", description: "Content and merchandising" },
      { path: "/admin/audit", label: "System Diagnostics", description: "Operational diagnostics" }
    ],
    actions: [
      { id: "product.approve", label: "Approve supplier product", permission: "products.write", auditEvent: "product.approved", notification: "product.published" },
      { id: "product.reject", label: "Reject supplier product", permission: "products.write", auditEvent: "product.rejected", notification: "product.rejected" },
      { id: "review.moderate", label: "Moderate review", permission: "cms.write", auditEvent: "review.moderated" },
      { id: "order.refund", label: "Process refund", permission: "payments.write", auditEvent: "order.refunded", notification: "order.refunded" }
    ],
    stateMachines: {
      supplier_product: {
        states: ["draft", "pending_review", "published", "rejected"],
        transitions: supplierProductTransitions
      }
    }
  },
  supplier: {
    role: "supplier",
    label: "Supplier",
    responsibilities: [
      "Create and submit product drafts",
      "Monitor approval status",
      "View stock levels managed by admin inventory",
      "View customer orders containing their products"
    ],
    permissions: getRolePermissions("supplier"),
    pages: [
      { path: "/supplier", label: "Overview", description: "Submission summary" },
      { path: "/supplier/products", label: "Products", description: "Manage listings" },
      { path: "/supplier/submissions", label: "Submissions", description: "Approval inbox" },
      { path: "/supplier/inventory", label: "Stock levels", description: "View admin-managed stock levels" }
    ],
    actions: [
      { id: "product.create", label: "Create draft", permission: "products.submit", auditEvent: "product.draft_created" },
      { id: "product.submit", label: "Submit for review", permission: "products.submit", auditEvent: "product.submitted", notification: "product.pending_review" }
    ],
    stateMachines: {
      supplier_product: {
        states: ["draft", "pending_review", "published", "rejected"],
        transitions: supplierProductTransitions
      }
    }
  },
  warehouse: {
    role: "warehouse",
    label: "Warehouse",
    responsibilities: [
      "Receive and allocate paid orders",
      "Pick, pack, and dispatch shipments",
      "Maintain stock movements audit trail"
    ],
    permissions: getRolePermissions("warehouse"),
    pages: [
      { path: "/warehouse/dashboard", label: "Today", description: "Daily queue" },
      { path: "/warehouse/orders", label: "Orders", description: "Incoming orders" },
      { path: "/warehouse/fulfillment", label: "Fulfillment", description: "Receive and dispatch orders" },
      { path: "/warehouse/activity", label: "History", description: "Dispatched order history" }
    ],
    actions: [
      { id: "order.receive", label: "Start packing", permission: "orders.lifecycle", auditEvent: "order.packing", notification: "order.processing" },
      { id: "order.dispatch", label: "Mark Dispatched", permission: "orders.lifecycle", auditEvent: "order.dispatched", notification: "order.shipped" },
      { id: "order.cancel", label: "Cancel & Delete Order", permission: "orders.lifecycle", auditEvent: "order.cancelled" }
    ],
    stateMachines: {
      fulfillment: {
        states: ["pending", "packing", "dispatched", "delivered"],
        transitions: [
          { from: "pending", to: "packing", action: "warehouse.pack", actor: "warehouse" },
          { from: "packing", to: "dispatched", action: "warehouse.dispatch", actor: "warehouse" },
          { from: "dispatched", to: "delivered", action: "shipment.delivered", actor: "warehouse" }
        ]
      }
    }
  }
};

export function getRoleWorkflow(role: WorkflowRole) {
  return ROLE_WORKFLOWS[role];
}

export function canTransition(
  machine: keyof typeof ROLE_WORKFLOWS.user.stateMachines | string,
  from: string,
  to: string,
  role: WorkflowRole
) {
  const workflow = ROLE_WORKFLOWS[role];
  const states = workflow.stateMachines[machine];
  if (!states) return false;
  return states.transitions.some(
    (transition) =>
      transition.from === from &&
      transition.to === to &&
      (transition.actor === role || (Array.isArray(transition.actor) && transition.actor.includes(role)))
  );
}

export function allWorkflowPages() {
  return Object.values(ROLE_WORKFLOWS).flatMap((workflow) =>
    workflow.pages.map((page) => ({ ...page, role: workflow.role, roleLabel: workflow.label }))
  );
}
