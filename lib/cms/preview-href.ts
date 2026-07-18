export type CmsPreviewOptions = {
  draft?: boolean;
  anchor?: string;
  basePath?: string;
};

function normalizePreviewBasePath(basePath: string) {
  const path = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function resolveDraftPreviewPath(basePath: string) {
  const path = normalizePreviewBasePath(basePath);
  if (path === "/" || path === "") {
    return "/preview/home";
  }
  if (path.startsWith("/blog/")) {
    const slug = path.slice("/blog/".length).split("/").filter(Boolean)[0];
    return slug ? `/preview/blog/${slug}` : "/preview/home";
  }
  if (path.startsWith("/preview/")) {
    return path;
  }
  // Non-home/blog targets never consumed cms_preview; keep the live path.
  return path;
}

export function buildCmsPreviewHref({ draft = true, anchor, basePath = "/" }: CmsPreviewOptions = {}) {
  const path = draft ? resolveDraftPreviewPath(basePath) : normalizePreviewBasePath(basePath);
  const hash = anchor ? (anchor.startsWith("#") ? anchor : `#${anchor}`) : "";
  return `${path}${hash}`;
}

export function appendPreviewRefreshParam(href: string, nonce: number) {
  const hashIndex = href.indexOf("#");
  const pathAndQuery = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const separator = pathAndQuery.includes("?") ? "&" : "?";
  return `${pathAndQuery}${separator}_cms_refresh=${nonce}${hash}`;
}

export function buildBlogPreviewHref(slug: string, draft = true) {
  if (!draft) {
    return `/blog/${slug}`;
  }
  return `/preview/blog/${slug}`;
}
