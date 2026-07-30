"use client";

import { usePathname } from "next/navigation";
import { PreSalesConsultationLauncher } from "@/components/pre-sales/pre-sales-consultation-launcher";
import { isAssistantSurfacePath } from "@/lib/assistant/is-assistant-surface";

export function PreSalesConsultationWidget() {
  const pathname = usePathname();
  if (!isAssistantSurfacePath(pathname)) return null;
  return <PreSalesConsultationLauncher />;
}
