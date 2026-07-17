"use client";

import dynamic from "next/dynamic";
import { ControlPlaneContentLoading } from "@/components/ui/control-plane-content-loading";

const AdminOrdersWorkspace = dynamic(
  () => import("@/components/admin/admin-orders-workspace").then((module) => module.AdminOrdersWorkspace),
  {
    loading: () => <ControlPlaneContentLoading label="Loading orders workspace" />
  }
);

export { AdminOrdersWorkspace };
