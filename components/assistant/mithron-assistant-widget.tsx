"use client";

import { usePathname } from "next/navigation";
import { MithronAssistantLauncher } from "@/components/assistant/mithron-assistant-launcher";
import { isAssistantSurfacePath } from "@/lib/assistant/is-assistant-surface";

export function MithronAssistantWidget() {
  const pathname = usePathname();
  if (!isAssistantSurfacePath(pathname)) return null;
  return <MithronAssistantLauncher />;
}
