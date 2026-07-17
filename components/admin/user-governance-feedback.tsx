"use client";

import { useEffect, useRef } from "react";
import { OperationalFeedback } from "@/components/admin/module-panel";

export function UserGovernanceFeedback({
  status,
  message
}: {
  status?: string;
  message?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const active = status === "success" || status === "error" || status === "warning";

  useEffect(() => {
    if (!active) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [active, message, status]);

  return (
    <div ref={ref} className={active ? "scroll-mt-4" : undefined}>
      <OperationalFeedback
        status={status}
        message={message}
        context="User access"
        idle="User changes, role updates, and account status results appear here."
      />
    </div>
  );
}
