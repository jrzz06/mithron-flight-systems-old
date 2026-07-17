"use client";

import type { ReactNode } from "react";

type AdminOrdersShellProps = {
  header: ReactNode;
  filters: ReactNode;
  toolbar: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  actions?: ReactNode;
  hasSelectedOrder?: boolean;
};

export function AdminOrdersShell({
  header,
  filters,
  toolbar,
  list,
  detail,
  actions,
  hasSelectedOrder = false
}: AdminOrdersShellProps) {
  return (
    <div data-admin-orders-shell className="grid min-w-0 gap-0 overflow-x-clip">
      <div className="sticky top-0 z-20 -mx-1 space-y-2 border-b border-[var(--platform-border)] bg-[var(--platform-bg)]/95 px-1 pb-3 backdrop-blur-sm">
        {header}
        {filters}
        {toolbar}
      </div>

      <div
        className={`mt-4 grid min-w-0 gap-4 ${
          hasSelectedOrder && actions
            ? "lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(260px,300px)]"
            : "lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]"
        }`}
      >
        <div
          className={`min-h-0 min-w-0 overflow-x-hidden lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto ${
            hasSelectedOrder ? "hidden lg:flex lg:flex-col" : "flex flex-col"
          }`}
        >
          {list}
        </div>

        <div
          className={`min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden lg:col-start-2 lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto ${
            hasSelectedOrder ? "flex" : "hidden lg:flex"
          }`}
        >
          <div className="min-h-0 min-w-0 flex-1">{detail}</div>
          {actions ? (
            <div className="min-w-0 shrink-0 overflow-x-hidden 2xl:hidden">{actions}</div>
          ) : null}
        </div>

        {actions ? (
          <div className="hidden min-h-0 min-w-0 flex-col overflow-x-hidden 2xl:col-start-3 2xl:flex 2xl:max-h-[calc(100dvh-11rem)] 2xl:overflow-y-auto">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
