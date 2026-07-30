import { describe, expect, it } from "vitest";
import {
  cleanupEditorHtmlMarkup,
  decodeEscapedEditorHtml,
  editorHtmlToPlainText,
  prepareEditorHtmlForDisplay,
  prepareEditorHtmlForSave
} from "@/lib/editor/prepare-html";
import { sanitizeEditorHtml } from "@/lib/editor/sanitize";
import { editorJsonToHtml } from "@/lib/editor/serialize";

describe("editor html prepare pipeline", () => {
  it("decodes escaped html instead of showing raw tags", () => {
    const escaped = "&lt;p&gt;Hello &lt;strong&gt;world&lt;/strong&gt;&lt;/p&gt;";
    expect(prepareEditorHtmlForDisplay(escaped)).toBe("<p>Hello <strong>world</strong></p>");
  });

  it("keeps safe color and text-align while stripping unsafe styles", () => {
    const dirty =
      '<p style="text-align:center;color:#ff0000;font-size:18px;"><span style="color:#00ff00;">Styled copy</span></p>';
    const clean = prepareEditorHtmlForDisplay(dirty);
    expect(clean).toMatch(/text-align:\s*center/i);
    expect(clean).toMatch(/color:\s*#ff0000/i);
    expect(clean).toMatch(/color:\s*#00ff00/i);
    expect(clean).toContain("Styled copy");
    expect(clean).not.toContain("font-size");
  });

  it("strips color and highlight for product description mode", () => {
    const dirty =
      '<p style="text-align:center;color:#ff0000;"><span style="color:#00ff00;background-color:#ffff00;" data-color="#ffff00">Styled copy</span></p>';
    const clean = prepareEditorHtmlForDisplay(dirty, { stripColors: true });
    expect(clean).toMatch(/text-align:\s*center/i);
    expect(clean).toContain("Styled copy");
    expect(clean).not.toMatch(/color:\s*#ff0000/i);
    expect(clean).not.toMatch(/color:\s*#00ff00/i);
    expect(clean).not.toMatch(/background-color/i);
    expect(clean).not.toMatch(/data-color/i);
  });

  it("preserves semantic formatting and safe links", () => {
    const dirty = "<p><strong>Bold</strong> and <em>italic</em> with <a href=\"https://mithron.com\">link</a></p><ul><li>One</li></ul>";
    const clean = prepareEditorHtmlForDisplay(dirty);
    expect(clean).toContain("<strong>Bold</strong>");
    expect(clean).toContain("<em>italic</em>");
    expect(clean).toContain('href="https://mithron.com"');
    expect(clean).toContain("<li>One</li>");
  });

  it("preserves the supported TipTap storefront contract without loss", () => {
    const dirty = [
      "<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4>",
      "<p><strong>Bold</strong> <em>Italic</em> <u>Underline</u> <s>Strike</s></p>",
      "<ul><li>Bullet</li></ul><ol><li>Numbered</li></ol>",
      "<blockquote>Quote</blockquote>",
      "<p><code>inline</code></p><pre><code>block</code></pre>",
      '<p><a href="https://example.com">Link</a></p>',
      "<table><thead><tr><th>K</th></tr></thead><tbody><tr><td>V</td></tr></tbody></table>"
    ].join("");
    const clean = prepareEditorHtmlForDisplay(dirty);
    expect(clean).toContain("<h1>H1</h1>");
    expect(clean).toContain("<h2>H2</h2>");
    expect(clean).toContain("<h3>H3</h3>");
    expect(clean).toContain("<h4>H4</h4>");
    expect(clean).toContain("<strong>Bold</strong>");
    expect(clean).toContain("<em>Italic</em>");
    expect(clean).toContain("<u>Underline</u>");
    expect(clean).toContain("<s>Strike</s>");
    expect(clean).toContain("<li>Bullet</li>");
    expect(clean).toContain("<li>Numbered</li>");
    expect(clean).toContain("<blockquote>");
    expect(clean).toContain("<code>inline</code>");
    expect(clean).toContain("<pre>");
    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain("<table>");
    expect(clean).toContain("<th>K</th>");
    expect(clean).toContain("<td>V</td>");
  });

  it("removes scripts and event handlers", () => {
    const dirty = '<p>Safe</p><script>alert(1)</script><img src=x onerror="alert(1)">';
    const clean = prepareEditorHtmlForDisplay(dirty);
    expect(clean).toBe("<p>Safe</p>");
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onerror");
  });

  it("wraps plain text into paragraphs", () => {
    expect(prepareEditorHtmlForDisplay("First block.\n\nSecond block.")).toBe(
      "<p>First block.</p><p>Second block.</p>"
    );
  });

  it("renders h3 headings instead of escaping them as plain text", () => {
    const html = "<h3 id=\"foo\">Title</h3>";
    const clean = prepareEditorHtmlForDisplay(html);
    expect(clean).toContain("<h3");
    expect(clean).toContain("Title");
    expect(clean).not.toContain("&lt;h3");
  });

  it("still decodes escaped entities after heading fix", () => {
    const escaped = "&lt;p&gt;Hello &lt;strong&gt;world&lt;/strong&gt;&lt;/p&gt;";
    expect(prepareEditorHtmlForDisplay(escaped)).toBe("<p>Hello <strong>world</strong></p>");
  });

  it("strips tags for plain text helpers", () => {
    expect(editorHtmlToPlainText("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });

  it("preserves color and alignment from editor json on save", () => {
    const html = editorJsonToHtml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [{ type: "text", text: "Centered", marks: [{ type: "textStyle", attrs: { color: "#ff0000" } }] }]
        }
      ]
    });
    expect(html).toContain("Centered");
    expect(html).toMatch(/text-align:\s*center/i);
    expect(html).toMatch(/color:\s*#ff0000/i);
  });

  it("strips color from editor json when product stripColors is set", () => {
    const html = editorJsonToHtml(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { textAlign: "center" },
            content: [{ type: "text", text: "Centered", marks: [{ type: "textStyle", attrs: { color: "#ff0000" } }] }]
          }
        ]
      },
      { stripColors: true }
    );
    expect(html).toContain("Centered");
    expect(html).toMatch(/text-align:\s*center/i);
    expect(html).not.toMatch(/color:\s*#ff0000/i);
  });

  it("cleans duplicate empty paragraphs", () => {
    expect(cleanupEditorHtmlMarkup("<p></p><p>Hello</p><p></p>")).toBe("<p>Hello</p>");
  });

  it("decodeEscapedEditorHtml handles double-encoded entities", () => {
    const once = decodeEscapedEditorHtml("&lt;p&gt;Hi&lt;/p&gt;");
    expect(once).toBe("<p>Hi</p>");
  });

  it("keeps editor atom block data attributes", () => {
    const html = '<div data-type="callout" data-variant="information" class="editor-callout"><p>Note</p></div>';
    expect(sanitizeEditorHtml(html)).toContain('data-type="callout"');
  });

  it("keeps style-bearing spans used for text color", () => {
    const html = '<p><span style="color: #2563eb">Blue</span></p>';
    expect(cleanupEditorHtmlMarkup(html)).toMatch(/style="color:\s*#2563eb"/i);
    expect(prepareEditorHtmlForDisplay(html)).toMatch(/color:\s*#2563eb/i);
  });
});

describe("prepareEditorHtmlForSave alias", () => {
  it("matches display normalization", () => {
    const input = '<p style="color:red">Same</p>';
    expect(prepareEditorHtmlForSave(input)).toBe(prepareEditorHtmlForDisplay(input));
    expect(prepareEditorHtmlForSave(input)).toMatch(/color:\s*red/i);
  });

  it("matches display normalization with stripColors", () => {
    const input = '<p style="color:red">Same</p>';
    expect(prepareEditorHtmlForSave(input, { stripColors: true })).toBe(
      prepareEditorHtmlForDisplay(input, { stripColors: true })
    );
    expect(prepareEditorHtmlForSave(input, { stripColors: true })).not.toMatch(/color:\s*red/i);
    expect(prepareEditorHtmlForSave(input, { stripColors: true })).toContain("Same");
  });
});
