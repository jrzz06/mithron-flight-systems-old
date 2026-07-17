"use client";

import dynamic from "next/dynamic";
import { ControlPlaneLoading } from "@/components/ui/control-plane-loading";

const InventoryManager = dynamic(
  () => import("@/components/admin/inventory-manager").then((module) => module.InventoryManager),
  {
    loading: () => <ControlPlaneLoading label="Loading inventory workspace" />
  }
);

export { InventoryManager };
