import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/** Press panel merged into Articles (/admin/blog). Keep route for old bookmarks. */
export default async function AdminPressRedirectPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const next = new URLSearchParams();

  const status = searchValue(params, "status");
  const q = searchValue(params, "q");
  const edit = searchValue(params, "edit");
  const createNew = searchValue(params, "new");
  const pressStatus = searchValue(params, "press_status");
  const pressMessage = searchValue(params, "press_message");

  if (status) next.set("status", status);
  if (q) next.set("q", q);
  if (edit) next.set("edit", edit);
  if (createNew) next.set("new", createNew);
  if (pressStatus) next.set("article_status", pressStatus);
  if (pressMessage) next.set("article_message", pressMessage);

  const query = next.toString();
  redirect(query ? `/admin/blog?${query}` : "/admin/blog");
}
