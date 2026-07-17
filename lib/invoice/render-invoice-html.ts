import "server-only";

import { mapInvoiceDataToTemplate } from "./map-to-template-input";
import { renderMithronInvoiceHtml } from "./mithron-invoice-template";
import type { InvoiceData } from "./types";

export function renderInvoiceHtmlDocument(data: InvoiceData, options?: { showToolbar?: boolean; serialNumber?: number }) {
  const serialNumber = options?.serialNumber ?? parseSerialFromInvoiceNumber(data.invoiceNumber);
  const templateInput = mapInvoiceDataToTemplate(data, serialNumber);
  return renderMithronInvoiceHtml(templateInput, options);
}

function parseSerialFromInvoiceNumber(invoiceNumber: string): number {
  const match = invoiceNumber.match(/INV-(\d{5})\//);
  if (match) return Number(match[1]);
  const legacy = invoiceNumber.match(/\/(\d{5})$/);
  if (legacy) return Number(legacy[1]);
  return 1;
}
