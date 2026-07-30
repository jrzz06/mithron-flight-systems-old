import type { ReactNode } from "react";
import "@/app/platform.css";
import { OperatorToastBridge } from "@/components/admin/operator-toast-bridge";
import type { PlatformScope } from "@/components/platform/types";

type ControlPlaneParallelLayoutProps = {
  scope: PlatformScope;
  shell: ReactNode;
  shellDataAttributes?: Record<string, string | boolean>;
  contentDataAttribute?: string;
  children: ReactNode;
};

export function ControlPlaneParallelLayout({
  scope,
  shell,
  shellDataAttributes = {},
  contentDataAttribute = "data-platform-content",
  children
}: ControlPlaneParallelLayoutProps) {
  return (
    <main
      data-control-plane
      data-control-plane-scope={scope}
      data-control-plane-theme="dark"
      data-admin-performance-theme
      {...shellDataAttributes}
      className="h-dvh overflow-hidden bg-[var(--platform-bg)] text-[var(--platform-text-primary)]"
    >
      <OperatorToastBridge />
      <div className="flex h-full min-h-0 flex-col overflow-hidden lg:pl-[248px]">
        {shell}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            {...{ [contentDataAttribute]: true }}
            data-admin-content
            className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 md:px-6 md:py-6"
          >
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
