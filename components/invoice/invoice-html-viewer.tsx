"use client";

type InvoiceHtmlViewerProps = {
  html: string;
  title?: string;
};

export function InvoiceHtmlViewer({ html, title = "Tax invoice" }: InvoiceHtmlViewerProps) {
  return (
    <iframe
      title={title}
      srcDoc={html}
      className="w-full min-h-[1100px] border border-[var(--border)] rounded-lg bg-[#eef0f3]"
      sandbox="allow-same-origin allow-scripts allow-modals"
    />
  );
}
