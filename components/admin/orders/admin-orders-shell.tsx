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

/** Shared scroll contract for master / detail / 2xl actions columns. */
const scrollColumnClass = "min-h-0 min-w-0 overflow-x-hidden overflow-y-auto";

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
    <div
      data-admin-orders-shell
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-x-clip"
    >
      <div className="sticky top-0 z-20 -mx-1 shrink-0 space-y-2 border-b border-[var(--platform-border)] bg-[var(--platform-bg)]/95 px-1 pb-3 backdrop-blur-sm">
        {header}
        {filters}
        {toolbar}
      </div>

      <div
        className={`mt-4 grid min-h-0 min-w-0 flex-1 gap-4 ${
          hasSelectedOrder && actions
            ? "xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(260px,300px)]"
            : "xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]"
        }`}
      >
        <div
          className={`${scrollColumnClass} ${
            hasSelectedOrder ? "hidden xl:flex xl:flex-col" : "flex flex-col"
          }`}
        >
          {list}
        </div>

        <div
          className={`${scrollColumnClass} flex-col gap-4 xl:col-start-2 ${
            hasSelectedOrder ? "flex" : "hidden xl:flex"
          }`}
        >
          {/* Intrinsic height — do not flex-1; actions must sit below in document flow */}
          <div className="min-w-0">{detail}</div>
          {actions ? (
            <div className="min-w-0 shrink-0 overflow-x-hidden 2xl:hidden">{actions}</div>
          ) : null}
        </div>

        {actions ? (
          <div
            className={`hidden ${scrollColumnClass} flex-col 2xl:col-start-3 2xl:flex`}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
