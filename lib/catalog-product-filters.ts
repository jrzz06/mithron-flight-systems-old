/**
 * PostgREST filters for mithron_products catalog status.
 *
 * `merge_status` is nullable for normal products and only set to
 * `archived_merged` after a merge. SQL `<>` / PostgREST `neq` treats
 * `NULL <> 'archived_merged'` as unknown, which drops every active row.
 *
 * Nest the merge_status clause inside `and=(...)` so a search `or=(...)`
 * query param cannot overwrite it.
 */
export const ACTIVE_PRODUCT_FILTER =
  "and=(workflow_status.neq.archived,archived_at.is.null,or(merge_status.is.null,merge_status.eq.active))";

export const ARCHIVED_PRODUCT_FILTER =
  "or=(workflow_status.eq.archived,archived_at.not.is.null)";

export const PUBLISHED_STOREFRONT_FILTER =
  "and=(workflow_status.eq.published,is_visible.eq.true,archived_at.is.null,or(merge_status.is.null,merge_status.eq.active))";
