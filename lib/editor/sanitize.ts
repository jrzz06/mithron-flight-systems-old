import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "a",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "figure",
  "figcaption",
  "img",
  "mark",
  "span",
  "div",
  "label",
  "input"
];

const SAFE_COLOR_PATTERN =
  /^(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+)\s*)?\)|hsla?\(\s*\d{1,3}\s*,\s*[\d.]+\s*%\s*,\s*[\d.]+\s*%(?:\s*,\s*(?:0|1|0?\.\d+)\s*)?\)|[a-z]{1,20})$/i;

const SAFE_TEXT_ALIGN_PATTERN = /^(left|right|center|justify)$/i;

const TEXT_STYLE_ATTRS = ["class", "style", "data-color"];

export type SanitizeEditorHtmlOptions = {
  /** Drop color / highlight presentation; keep semantic marks and text-align. */
  stripColors?: boolean;
};

function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value, "https://example.invalid");
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeAbsoluteHttpUrl(value: string) {
  if (!/^https?:\/\//i.test(value.trim())) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeColorValue(value: string) {
  return SAFE_COLOR_PATTERN.test(value.trim());
}

function sanitizeInlineStyle(style: string | undefined, stripColors: boolean) {
  if (!style?.trim()) return undefined;
  const kept: string[] = [];
  for (const part of style.split(";")) {
    const colon = part.indexOf(":");
    if (colon <= 0) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const val = part.slice(colon + 1).trim();
    if (!val) continue;
    if (key === "color" || key === "background-color") {
      if (!stripColors && isSafeColorValue(val)) {
        kept.push(`${key}: ${val}`);
      }
      continue;
    }
    if (key === "text-align" && SAFE_TEXT_ALIGN_PATTERN.test(val)) {
      kept.push(`${key}: ${val}`);
    }
  }
  return kept.length ? kept.join("; ") : undefined;
}

/** Strip unsafe presentation attrs; optionally keep editor color / highlight. */
function stripPresentationAttributes(attribs: Record<string, string>, stripColors: boolean) {
  const next = { ...attribs };
  const safeStyle = sanitizeInlineStyle(next.style, stripColors);
  if (safeStyle) next.style = safeStyle;
  else delete next.style;

  if (!stripColors && next["data-color"] && isSafeColorValue(next["data-color"])) {
    // keep TipTap highlight color hint
  } else {
    delete next["data-color"];
  }

  delete next.color;
  delete next.face;
  delete next.size;
  delete next.align;
  delete next.valign;
  delete next.width;
  delete next.height;
  delete next.border;
  delete next.cellpadding;
  delete next.cellspacing;
  return next;
}

export function sanitizeEditorHtml(html: string, options: SanitizeEditorHtmlOptions = {}) {
  const stripColors = Boolean(options.stripColors);
  const transform = (tagName: string, attribs: Record<string, string>) => ({
    tagName,
    attribs: stripPresentationAttributes(attribs, stripColors)
  });

  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "rel", "target", "class", "style"],
      img: ["src", "alt", "class", "data-media-asset-id", "data-caption"],
      figure: ["class"],
      figcaption: ["class"],
      div: ["class", "style", "data-type", "data-variant", "data-title", "data-icon", "data-description", "data-rows", "data-items", "data-color"],
      span: TEXT_STYLE_ATTRS,
      p: TEXT_STYLE_ATTRS,
      h1: TEXT_STYLE_ATTRS,
      h2: TEXT_STYLE_ATTRS,
      h3: TEXT_STYLE_ATTRS,
      h4: TEXT_STYLE_ATTRS,
      mark: TEXT_STYLE_ATTRS,
      td: ["colspan", "rowspan", "class", "style"],
      th: ["colspan", "rowspan", "class", "style"],
      input: ["type", "checked", "disabled"],
      ul: ["class"],
      ol: ["class"],
      li: ["class", "style"],
      blockquote: ["class"],
      code: ["class"],
      pre: ["class"],
      strong: ["class", "style"],
      em: ["class", "style"],
      u: ["class", "style"],
      s: ["class", "style"]
    },
    allowedStyles: stripColors
      ? {
          "*": {
            "text-align": [SAFE_TEXT_ALIGN_PATTERN]
          }
        }
      : {
          "*": {
            color: [SAFE_COLOR_PATTERN],
            "background-color": [SAFE_COLOR_PATTERN],
            "text-align": [SAFE_TEXT_ALIGN_PATTERN]
          }
        },
    transformTags: {
      b: "strong",
      i: "em",
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        const cleaned = stripPresentationAttributes(attribs, stripColors);
        if (href && !isSafeHttpUrl(href)) {
          return { tagName: "a", attribs: { ...cleaned, href: "#" } };
        }
        return { tagName, attribs: cleaned };
      },
      img: (tagName, attribs) => {
        const src = attribs.src ?? "";
        const cleaned = stripPresentationAttributes(attribs, stripColors);
        delete cleaned.style;
        delete cleaned["data-color"];
        if (src.startsWith("data:")) {
          return { tagName: "span", attribs: {} };
        }
        if (!src || !isSafeAbsoluteHttpUrl(src)) {
          return { tagName: "span", attribs: {} };
        }
        return { tagName, attribs: cleaned };
      },
      p: (_tagName, attribs) => transform("p", attribs),
      span: (_tagName, attribs) => transform("span", attribs),
      div: (_tagName, attribs) => transform("div", attribs),
      h1: (_tagName, attribs) => transform("h1", attribs),
      h2: (_tagName, attribs) => transform("h2", attribs),
      h3: (_tagName, attribs) => transform("h3", attribs),
      h4: (_tagName, attribs) => transform("h4", attribs),
      mark: (_tagName, attribs) =>
        stripColors ? { tagName: "span", attribs: stripPresentationAttributes(attribs, true) } : transform("mark", attribs)
    },
    disallowedTagsMode: "discard"
  });
}

/** @deprecated Use sanitizeEditorHtml — kept for product overview compatibility */
export function sanitizeProductHtml(html: string) {
  return sanitizeEditorHtml(html, { stripColors: true });
}
