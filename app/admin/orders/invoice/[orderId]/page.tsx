import { notFound } from "next/navigation";
import { InvoiceHtmlViewer } from "@/components/invoice/invoice-html-viewer";
import { getStoredInvoiceHtml } from "@/lib/invoice/generate-invoice";

export const dynamic = "force-dynamic";

export default async function AdminOrderInvoicePage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const invoiceHtml = await getStoredInvoiceHtml(orderId);
  if (!invoiceHtml) notFound();
  return <InvoiceHtmlViewer html={invoiceHtml} />;
}
