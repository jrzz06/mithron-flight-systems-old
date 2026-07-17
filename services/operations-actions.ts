type JsonRecord = Record<string, unknown>;

export type WarehouseStockAdjustmentInput = {
  productSlug: string;
  warehouseCode: string;
  availableQuantity: number;
  committedQuantity?: number;
  sku?: string;
  metadata?: JsonRecord;
};

export type DeploymentRequestInput = {
  requesterEmail: string;
  region?: string;
  missionProfile?: string;
  notes?: string;
  priority?: "low" | "normal" | "high" | "critical";
  payload?: JsonRecord;
};

export type StaffTaskInput = {
  title: string;
  body?: string;
  priority?: "low" | "normal" | "high" | "critical";
  assignedTo?: string;
  relatedRequestId?: string;
  dueAt?: string;
};

function assertNonEmpty(value: string | undefined, label: string) {
  if (!value?.trim()) {
    throw new Error(`${label} is required.`);
  }
}

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function optionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildWarehouseStockAdjustment(input: WarehouseStockAdjustmentInput) {
  assertNonEmpty(input.productSlug, "productSlug");
  assertNonEmpty(input.warehouseCode, "warehouseCode");
  assertNonNegativeInteger(input.availableQuantity, "availableQuantity");
  const committedQuantity = input.committedQuantity ?? 0;
  assertNonNegativeInteger(committedQuantity, "committedQuantity");

  return {
    product_slug: input.productSlug.trim(),
    warehouse_code: input.warehouseCode.trim(),
    sku: optionalText(input.sku),
    available_quantity: input.availableQuantity,
    committed_quantity: committedQuantity,
    metadata: input.metadata ?? {}
  };
}

export function buildDeploymentRequestPayload(input: DeploymentRequestInput) {
  assertNonEmpty(input.requesterEmail, "requesterEmail");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.requesterEmail.trim())) {
    throw new Error("requesterEmail must be a valid email address.");
  }

  return {
    requester_email: input.requesterEmail.trim(),
    region: optionalText(input.region),
    mission_profile: optionalText(input.missionProfile),
    status: "pending",
    notes: optionalText(input.notes),
    payload: {
      ...(input.payload ?? {}),
      priority: input.priority ?? "normal"
    }
  };
}

export function buildStaffTaskPayload(input: StaffTaskInput) {
  assertNonEmpty(input.title, "title");

  return {
    title: input.title.trim(),
    body: optionalText(input.body),
    status: "open",
    priority: input.priority ?? "normal",
    assigned_to: optionalText(input.assignedTo),
    related_request_id: optionalText(input.relatedRequestId),
    due_at: optionalText(input.dueAt)
  };
}
