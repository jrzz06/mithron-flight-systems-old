import { CMS_DEPRECATED_TABLE_NOTES, isDeprecatedCmsStorefrontTable } from "@/config/cms-deprecations";

export function assertWritableCmsTable(table: string) {
  if (!isDeprecatedCmsStorefrontTable(table)) return;

  const note = CMS_DEPRECATED_TABLE_NOTES[table];
  throw new Error(note ?? `Table ${table} is deprecated and cannot be edited through CMS workflows.`);
}
