import { ModulePanel } from "@/components/admin/module-panel";
import { AdminMediaLiveSync } from "@/components/admin/admin-media-live-sync";
import { MediaLibraryClient } from "./media-library-client";
import { listMediaLibraryItems } from "./actions";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

export const dynamic = "force-dynamic";

export default async function AdminMediaPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const qRaw = params.q;
  const q = Array.isArray(qRaw) ? qRaw[0] ?? "" : qRaw ?? "";
  const [items, policy] = await Promise.all([
    listMediaLibraryItems({ q, limit: 400 }).catch(() => []),
    getAdminSettingsPolicy()
  ]);

  return (
    <div className="grid gap-4" data-admin-media-page>
      <AdminMediaLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <ModulePanel
        eyebrow="Media"
        title="Media library"
        description="Browse and manage uploaded CMS and blog assets. Virtualized for large libraries."
      >
        <MediaLibraryClient items={items} />
      </ModulePanel>
    </div>
  );
}
