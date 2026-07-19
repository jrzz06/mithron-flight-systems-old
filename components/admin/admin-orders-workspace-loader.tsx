"use client";

import dynamic from "next/dynamic";
import { ControlPlaneContentLoading } from "@/components/ui/control-plane-content-loading";
import { SoftErrorBoundary } from "@/components/soft-error-boundary";
import type { ComponentProps } from "react";

const AdminOrdersWorkspaceInner = dynamic(
  () => import("@/components/admin/admin-orders-workspace").then((module) => module.AdminOrdersWorkspace),
  {
    loading: () => <ControlPlaneContentLoading label="Loading orders workspace" />
  }
);

export function AdminOrdersWorkspace(props: ComponentProps<typeof AdminOrdersWorkspaceInner>) {
  return (
    <SoftErrorBoundary label="Orders workspace" variant="retry">
      <AdminOrdersWorkspaceInner {...props} />
    </SoftErrorBoundary>
  );
}
