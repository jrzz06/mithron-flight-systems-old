export type InvoiceAddress = {
  lines: string[];
};

export type InvoiceLineItem = {
  description: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  taxableBase: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  taxGroupLabel: string;
};

export type InvoiceGstSummaryRow = {
  taxRate: number;
  taxableBase: number;
  taxAmount: number;
};

export type InvoiceData = {
  invoiceNumber: string;
  financialYear: string;
  invoiceDate: string;
  dueDate: string;
  orderId: string;
  orderNumber: string;
  paymentId: string;
  transactionId: string;
  paymentProvider: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    gstin?: string;
    company?: string;
  };
  billingAddress: InvoiceAddress;
  shippingAddress: InvoiceAddress;
  lineItems: InvoiceLineItem[];
  gstSummary: InvoiceGstSummaryRow[];
  subtotal: number;
  taxTotal: number;
  shippingCharge: number;
  discountTotal: number;
  grandTotal: number;
  paymentMethod: string;
  paymentStatus: string;
  companyGstin: string;
  companyName: string;
  companyAddress: string[];
  supportEmail: string;
  supportPhone: string;
  logoUrl?: string;
};
