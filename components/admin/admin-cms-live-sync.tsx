"use client";

/** Homepage CMS syncs via draft/publish + cache tags; no AdminLiveResourceId for cms. */
export function AdminCmsLiveSync({ enabled = true }: { enabled?: boolean }) {
  if (!enabled) return null;
  return <div data-admin-cms-live-sync className="sr-only" aria-hidden="true" />;
}
