export type CmsPreviewOptions = {
  draft?: boolean;
  anchor?: string;
  basePath?: string;
};

export function buildCmsPreviewHref({ draft = true, anchor, basePath = "/" }: CmsPreviewOptions = {}) {
  const path = basePath.startsWith("/") ? basePath : `/${basePath}`;
  const query = draft ? "?cms_preview=draft" : "";
  const hash = anchor ? (anchor.startsWith("#") ? anchor : `#${anchor}`) : "";
  return `${path}${query}${hash}`;
}

export function appendPreviewRefreshParam(href: string, nonce: number) {
  const hashIndex = href.indexOf("#");
  const pathAndQuery = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const separator = pathAndQuery.includes("?") ? "&" : "?";
  return `${pathAndQuery}${separator}_cms_refresh=${nonce}${hash}`;
}

export function buildBlogPreviewHref(slug: string, draft = true) {
  return buildCmsPreviewHref({ draft, basePath: `/blog/${slug}` });
}

function isCmsDraftPreviewParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.includes("draft");
  return value === "draft";
}
