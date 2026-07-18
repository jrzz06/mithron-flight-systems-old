const FULFILLMENT_STEP_LABELS: Record<string, string> = {
  pending: "Waiting",
  packing: "Packing",
  processing: "Packing",
  picked: "Packing",
  packed: "Packing",
  ready_to_dispatch: "Dispatched",
  shipped: "Dispatched",
  dispatched: "Dispatched",
  in_transit: "Dispatched",
  delivered: "Completed",
  cancelled: "Cancelled"
};

const EMPLOYEE_FULFILLMENT_LABELS: Record<string, string> = {
  pending: "Awaiting Receipt",
  packing: "Packing",
  processing: "Packing",
  picked: "Packing",
  packed: "Packing",
  ready_to_dispatch: "Dispatched",
  shipped: "Dispatched",
  dispatched: "Dispatched",
  in_transit: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Waiting",
  reserved: "Allocated",
  packed: "Packed",
  ready_for_pickup: "Ready for Pickup",
  shipped: "Dispatched",
  in_transit: "In Transit",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled"
};

export function fulfillmentStepLabel(status: string) {
  return FULFILLMENT_STEP_LABELS[status] ?? status.replaceAll("_", " ");
}

export function employeeFulfillmentLabel(status: string) {
  return EMPLOYEE_FULFILLMENT_LABELS[status] ?? fulfillmentStepLabel(status);
}

export function shipmentStatusLabel(status: string) {
  return SHIPMENT_STATUS_LABELS[status] ?? fulfillmentStepLabel(status);
}

export const ORDER_STEP_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "pending", label: "Awaiting Receipt" },
  { value: "packing", label: "Packing" },
  { value: "dispatched", label: "Dispatched" },
  { value: "cancelled", label: "Cancelled" }
] as const;

export const RECEIVED_FULFILLMENT_STATUSES = ["packing"] as const;

export function matchesEmployeeFulfillmentFilter(fulfillmentStatus: string, filter: string) {
  if (!filter) return true;
  if (filter === "received" || filter === "packing") {
    return fulfillmentStatus === "packing"
      || ["processing", "picked", "packed"].includes(fulfillmentStatus);
  }
  if (filter === "dispatched" || filter === "shipped") {
    return fulfillmentStatus === "dispatched"
      || ["ready_to_dispatch", "shipped"].includes(fulfillmentStatus);
  }
  return fulfillmentStatus === filter;
}
