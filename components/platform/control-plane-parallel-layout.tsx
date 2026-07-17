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
      className="min-h-screen bg-[var(--platform-bg)] text-[var(--platform-text-primary)]"
    >
      <OperatorToastBridge />
      <div className="min-h-screen lg:pl-[248px]">
        {shell}
        <section className="min-w-0">
          <div {...{ [contentDataAttribute]: true }} data-admin-content className="px-4 py-5 md:px-6 md:py-6">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
