import Link from "next/link";
import { ModulePanel } from "@/components/admin/module-panel";
import { AdminArticlesLiveList } from "@/components/admin/admin-articles-live-list";
import { AdminArticlesLiveSync } from "@/components/admin/admin-articles-live-sync";
import {
  getPressCoverageById,
  listAdminPressCoverage,
  type PressCoverageItem
} from "@/services/press-coverage";
import { ArticleEditorForm } from "./article-editor-form";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const statusTabs = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" }
] as const;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AdminArticlesPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const statusFilter = searchValue(params, "status") || "all";
  const query = searchValue(params, "q");
  const editId = searchValue(params, "edit");
  const createNew = searchValue(params, "new") === "1";
  const policy = await getAdminSettingsPolicy();

  let items: PressCoverageItem[] = [];
  let loadError: string | null = null;
  try {
    items = await listAdminPressCoverage({ status: statusFilter, q: query });
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load articles.";
    console.error("[mithron-admin] Articles list failed.", error);
  }

  let editing: PressCoverageItem | null = editId ? items.find((item) => item.id === editId) ?? null : null;
  if (editId && !editing && !loadError) {
    try {
      editing = await getPressCoverageById(editId);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Could not load article for editing.";
    }
  }
  const showEditor = createNew || Boolean(editing) || Boolean(editId);

  return (
    <div className="grid gap-4" data-admin-blog-page data-admin-articles-page>
      <AdminArticlesLiveSync enabled={policy.realtimeUpdatesEnabled} />
      {loadError ? (
        <div className="rounded-[8px] border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {loadError} Check Supabase config and the press_coverage table, then try again.
        </div>
      ) : null}

      <ModulePanel
        eyebrow="Content"
        title="Articles"
        description="Add homepage article cards with a heading, image, and redirect link. Published cards appear in Related Articles."
      >
        <div className="mb-4 flex justify-end">
          <Link
            href="/admin/blog?new=1"
            className="platform-btn-primary inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium"
          >
            New article
          </Link>
        </div>

        <nav className="mb-4 flex flex-wrap gap-2" aria-label="Article status filters">
          {statusTabs.map((tab) => {
            const active = statusFilter === tab.key;
            const href = `/admin/blog?status=${tab.key}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
            return (
              <Link
                key={tab.key}
                href={href}
                className={`rounded-[8px] border px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "border-[var(--platform-accent)]/40 bg-[var(--platform-accent-soft)] text-[var(--platform-text-primary)]"
                    : "border-[var(--platform-border)] text-[var(--platform-text-secondary)] hover:bg-[var(--platform-surface-muted)]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="status" value={statusFilter} />
          <label className="grid flex-1 gap-1 text-sm">
            <span className="text-[var(--platform-text-muted)]">Search</span>
            <input
              name="q"
              defaultValue={query}
              placeholder="Heading or link"
              className="h-10 rounded-[10px] border-0 bg-[var(--platform-surface-muted)]/60 px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
            />
          </label>
          <button type="submit" className="h-10 rounded-lg border border-[var(--platform-border)] px-4 text-sm font-medium">
            Search
          </button>
        </form>

        <AdminArticlesLiveList articles={items} loadError={loadError} />
      </ModulePanel>

      {showEditor ? (
        <ModulePanel
          eyebrow="Editor"
          title={editing ? `Edit · ${editing.title}` : "New article"}
          description="Only three fields: heading, image, and where the card should go."
        >
          {editId && !editing ? (
            <p className="text-sm text-[var(--platform-text-muted)]">Article not found.</p>
          ) : (
            <ArticleEditorForm item={editing} />
          )}
        </ModulePanel>
      ) : null}
    </div>
  );
}
