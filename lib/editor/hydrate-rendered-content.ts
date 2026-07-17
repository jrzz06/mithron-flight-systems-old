export type SpecificationRow = { label: string; value: string };
export type DownloadItem = { label: string; href: string; kind?: string };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseJsonAttribute<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Only http(s) (and protocol-relative/relative) URLs may be emitted into an
// href. This blocks javascript:, data:, vbscript: and similar payloads that
// would otherwise survive escapeHtml and become clickable after hydration.
function isSafeDownloadHref(value: string): boolean {
  try {
    const url = new URL(value, "https://example.invalid");
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function renderSpecificationBlock(rows: SpecificationRow[]) {
  if (!rows.length) return "";
  return `<div class="editor-specification-rows">${rows
    .map((row) => {
      const label = escapeHtml(row.label?.trim() ?? "");
      const rowValue = escapeHtml(row.value?.trim() ?? "");
      if (!label && !rowValue) return "";
      return `<div class="editor-specification-row"><span class="editor-specification-label">${label}</span><span class="editor-specification-value">${rowValue}</span></div>`;
    })
    .join("")}</div>`;
}

export function renderFeatureCardBlock(title: string, description: string) {
  const safeTitle = escapeHtml(title.trim());
  const safeDescription = escapeHtml(description.trim());
  if (!safeTitle && !safeDescription) return "";
  return `${safeTitle ? `<p class="editor-feature-card-title">${safeTitle}</p>` : ""}${safeDescription ? `<p class="editor-feature-card-description">${safeDescription}</p>` : ""}`;
}

export function renderDownloadsBlock(items: DownloadItem[]) {
  if (!items.length) return "";
  return `<ul class="editor-downloads-list">${items
    .map((item) => {
      const href = item.href?.trim() ?? "";
      const label = escapeHtml(item.label?.trim() || href);
      if (!href || !isSafeDownloadHref(href)) return `<li>${label}</li>`;
      return `<li><a href="${escapeHtml(href)}" rel="noopener noreferrer" target="_blank">${label}</a></li>`;
    })
    .join("")}</ul>`;
}

export function hydrateEditorAtomBlocks(root: ParentNode) {
  root.querySelectorAll('[data-type="specification"]').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.hydrated === "true" || node.textContent?.trim()) return;
    const rows = parseJsonAttribute<SpecificationRow[]>(node.getAttribute("data-rows"), []);
    const markup = renderSpecificationBlock(rows);
    if (!markup) return;
    node.innerHTML = markup;
    node.dataset.hydrated = "true";
  });

  root.querySelectorAll('[data-type="feature-card"]').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.hydrated === "true" || node.textContent?.trim()) return;
    const title = node.getAttribute("data-title") ?? "";
    const description = node.getAttribute("data-description") ?? "";
    const markup = renderFeatureCardBlock(title, description);
    if (!markup) return;
    node.innerHTML = markup;
    node.dataset.hydrated = "true";
  });

  root.querySelectorAll('[data-type="downloads"]').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.hydrated === "true" || node.textContent?.trim()) return;
    const items = parseJsonAttribute<DownloadItem[]>(node.getAttribute("data-items"), []);
    const markup = renderDownloadsBlock(items);
    if (!markup) return;
    node.innerHTML = markup;
    node.dataset.hydrated = "true";
  });
}
