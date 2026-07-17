"use client";

import dynamic from "next/dynamic";
import { ControlPlaneLoading } from "@/components/ui/control-plane-loading";

const ProductDetailEditDialog = dynamic(
  () => import("@/app/admin/products/product-detail-edit-dialog").then((module) => module.ProductDetailEditDialog),
  { loading: () => <ControlPlaneLoading label="Loading editor" /> }
);

export { ProductDetailEditDialog };
