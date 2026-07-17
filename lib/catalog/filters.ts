export const LEGACY_WIX_INVENTORY_CATEGORY = "Imported Wix Inventory";

export const publishedCatalogFilter = `workflow_status=eq.published&is_visible=eq.true&category=neq.${encodeURIComponent(LEGACY_WIX_INVENTORY_CATEGORY)}&slug=not.like.audit-trace-*`;

export function buildSlugInFilter(slugs: string[]) {
  const unique = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  if (!unique.length) return "";
  const encoded = unique.map((slug) => encodeURIComponent(slug)).join(",");
  return `slug=in.(${encoded})`;
}
