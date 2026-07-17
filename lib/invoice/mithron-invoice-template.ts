import "server-only";

import { formatInrAmount, roundInr, subtractInr } from "@/lib/currency";
import { toAbsoluteUrl } from "@/lib/site-url";

export type MithronInvoiceInput = {
  serial: string;
  financialYr: string;
  date: string;
  dueDate: string;
  customer: {
    name: string;
    gstin?: string;
    billTo: string[];
    shipTo?: string[];
  };
  items: Array<{
    desc: string;
    qty: number;
    unit: string;
    rate: number;
    gstPct: number;
  }>;
  paymentMade: number | null;
  grandTotal?: number;
};

const CO = {
  name: "Mithron India smart services private limited",
  addr1: "Building India's Affordable Drone Ecosystem",
  addr2: "No. 35/1, GST Road, Essa Pallavaram",
  addr3: "Chennai, Tamil Nadu 600043",
  country: "India",
  gstin: "33AAQCM2390E1ZG",
  phone: "+91 8861304108",
  email: "anitha@mithronsmart.com",
  web: "www.mithron.co",
  get logoUrl() {
    return toAbsoluteUrl("/favicon.svg");
  }
};

const CSS = `
.mi-wrap{font-family:Arial,sans-serif;font-size:12px;color:#000;background:#fff}
.mi-page{width:794px;margin:0 auto;background:#fff}

/* HEADER */
.mi-header{display:grid;grid-template-columns:1fr auto;border:1.5px solid #000;padding:14px 16px;gap:12px;align-items:start}
.mi-header-left{display:flex;gap:14px;align-items:flex-start}
.mi-logo{width:82px;height:62px;flex-shrink:0;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;font-size:9px;color:#bbb}
.mi-logo img{width:100%;height:100%;object-fit:contain}
.mi-co{line-height:1.6}
.mi-co-name{font-weight:700;font-size:13.5px;margin-bottom:3px}
.mi-co p{font-size:10.5px}
.mi-header-right{text-align:right;padding-top:6px}
.mi-title{font-size:28px;font-weight:700;letter-spacing:1.5px;line-height:1}

/* META */
.mi-meta{display:grid;grid-template-columns:1fr 1fr 1fr;border:1.5px solid #000;border-top:none}
.mi-meta-cell{padding:5px 10px;font-size:11px;line-height:1.9;border-right:1px solid #000}
.mi-meta-cell:last-child{border-right:none}
.mi-meta-cell b{display:inline-block;min-width:95px;font-weight:700}

/* ADDRESS */
.mi-addr{display:grid;grid-template-columns:1fr 1fr;border:1.5px solid #000;border-top:none}
.mi-addr-cell{padding:9px 12px;font-size:10.5px;line-height:1.75;border-right:1px solid #000;vertical-align:top}
.mi-addr-cell:last-child{border-right:none}
.mi-addr-label{font-weight:700;font-size:10px;text-decoration:underline;margin-bottom:5px}
.mi-addr-name{font-weight:700;font-size:11.5px;margin-bottom:3px}
.mi-addr-line{display:block}

/* TABLE */
.mi-table-wrap{border:1.5px solid #000;border-top:none;overflow:hidden}
.mi-table{width:100%;border-collapse:collapse;table-layout:fixed}
.mi-table th,.mi-table td{border:1px solid #000;padding:5px 6px;font-size:10.5px;vertical-align:middle}
.mi-table thead tr:first-child{background:#f0f0f0}
.mi-table th{font-weight:700;text-align:center}
.mi-gst-sub{background:#f7f7f7}
.mi-gst-sub th{font-size:9.5px;font-weight:600;padding:3px 6px}
.t-no{width:28px;text-align:center!important}
.t-desc{text-align:left!important}
.t-qty{width:56px;text-align:center!important}
.t-rate{width:76px;text-align:right!important}
.t-cp{width:40px;text-align:center!important}
.t-ca{width:74px;text-align:right!important}
.t-sp{width:40px;text-align:center!important}
.t-sa{width:74px;text-align:right!important}
.t-amt{width:84px;text-align:right!important}

/* FOOTER */
.mi-footer{display:grid;grid-template-columns:1fr 234px;border:1.5px solid #000;border-top:none}
.mi-words{padding:10px 12px;border-right:1px solid #000;font-size:10.5px;line-height:1.75}
.mi-words b{display:block;font-size:10px;font-weight:700;margin-bottom:3px}
.mi-summary{font-size:10.5px}
.mi-srow{display:flex;justify-content:space-between;padding:4px 10px;border-bottom:1px solid #e5e5e5}
.mi-srow:last-child{border-bottom:none}
.mi-srow span:last-child{text-align:right;min-width:90px;font-variant-numeric:tabular-nums}
.mi-ssep{border-bottom:1.5px solid #aaa!important}
.mi-stotal{font-weight:700;font-size:11.5px;border-top:2px solid #000!important;border-bottom:2px solid #000!important}
.mi-sbalance{font-weight:700;font-size:12.5px;border-top:1.5px solid #000!important}
`;

const PAGE_SHELL_CSS = `
  body { margin: 0; background: #eef0f3; }
  .print-btn {
    display: block; margin: 16px auto; padding: 9px 24px;
    background: #0f172a; color: #fff; border: none;
    border-radius: 6px; font-size: 13px; cursor: pointer;
  }
  @media print { .print-btn { display: none; } body { background: #fff; } }
`;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function inr(n: number) {
  return formatInrAmount(n);
}

export function toWords(n: number) {
  n = Math.round(n);
  if (n === 0) return "Zero Rupees Only";
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen"
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function two(x: number) {
    return x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ` ${ones[x % 10]}` : "");
  }
  function three(x: number) {
    return x < 100 ? two(x) : `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ` ${two(x % 100)}` : ""}`;
  }
  const parts: string[] = [];
  let r = n;
  const cr = Math.floor(r / 10000000);
  r %= 10000000;
  const lk = Math.floor(r / 100000);
  r %= 100000;
  const th = Math.floor(r / 1000);
  r %= 1000;
  if (cr) parts.push(`${three(cr)} Crore`);
  if (lk) parts.push(`${two(lk)} Lakh`);
  if (th) parts.push(`${three(th)} Thousand`);
  if (r) parts.push(three(r));
  return `Indian Rupee ${parts.join(" ")} Only`;
}

function addrLines(arr: string[]) {
  return (arr || []).map((line) => `<span class="mi-addr-line">${escapeHtml(line)}</span>`).join("");
}

export function renderMithronInvoiceBody(data: MithronInvoiceInput): string {
  let subTotal = 0;
  const gstMap: Record<string, { cgst: number; sgst: number }> = {};

  const rowsHTML = data.items
    .map((it, i) => {
      const lineAmt = it.qty * it.rate;
      const halfPct = it.gstPct / 2;
      const cgstAmt = lineAmt * halfPct / 100;
      const sgstAmt = cgstAmt;
      subTotal += lineAmt;
      const key = String(halfPct);
      if (!gstMap[key]) gstMap[key] = { cgst: 0, sgst: 0 };
      gstMap[key].cgst += cgstAmt;
      gstMap[key].sgst += sgstAmt;
      return `
        <tr>
          <td class="t-no">${i + 1}</td>
          <td class="t-desc">${escapeHtml(it.desc)}</td>
          <td class="t-qty">${it.qty}${it.unit ? ` ${escapeHtml(it.unit)}` : ""}</td>
          <td class="t-rate">${inr(it.rate)}</td>
          <td class="t-cp">${halfPct}%</td>
          <td class="t-ca">${inr(cgstAmt)}</td>
          <td class="t-sp">${halfPct}%</td>
          <td class="t-sa">${inr(sgstAmt)}</td>
          <td class="t-amt">${inr(lineAmt)}</td>
        </tr>`;
    })
    .join("");

  let totalGst = 0;
  const gstSummaryHTML = Object.keys(gstMap)
    .sort((a, b) => parseFloat(a) - parseFloat(b))
    .map((k) => {
      const { cgst, sgst } = gstMap[k];
      totalGst += cgst + sgst;
      return `
          <div class="mi-srow"><span>CGST ${k}%</span><span>${inr(cgst)}</span></div>
          <div class="mi-srow"><span>SGST ${k}%</span><span>${inr(sgst)}</span></div>`;
    })
    .join("");

  const rawTotal = subTotal + totalGst;
  const rounded = data.grandTotal !== undefined ? roundInr(data.grandTotal) : roundInr(rawTotal);
  const rounding = subtractInr(rounded, roundInr(rawTotal));
  const paid = data.paymentMade !== null && data.paymentMade !== undefined ? roundInr(data.paymentMade) : rounded;
  const balance = subtractInr(rounded, paid);
  const invNum = `INV-${String(data.serial).padStart(5, "0")}/${data.financialYr}`;
  const logo = CO.logoUrl
    ? `<img src="${escapeHtml(CO.logoUrl)}" alt="Logo"/>`
    : "<span>LOGO</span>";

  return `
<div class="mi-wrap">
  <div class="mi-page">

    <!-- HEADER -->
    <div class="mi-header">
      <div class="mi-header-left">
        <div class="mi-logo">${logo}</div>
        <div class="mi-co">
          <div class="mi-co-name">${CO.name}</div>
          <p>${CO.name}</p>
          <p>${CO.addr1}</p>
          <p>${CO.addr2}</p>
          <p>${CO.addr3}</p>
          <p>${CO.country}</p>
          <p>GSTIN ${CO.gstin}</p>
          <p>${CO.phone}</p>
          <p>${CO.email} &nbsp;|&nbsp; ${CO.web}</p>
        </div>
      </div>
      <div class="mi-header-right">
        <div class="mi-title">TAX INVOICE</div>
      </div>
    </div>

    <!-- META -->
    <div class="mi-meta">
      <div class="mi-meta-cell"><b>#</b>${invNum}</div>
      <div class="mi-meta-cell"><b>Invoice Date</b>${escapeHtml(data.date)}</div>
      <div class="mi-meta-cell"><b>Due Date</b>${escapeHtml(data.dueDate)}</div>
    </div>

    <!-- ADDRESSES -->
    <div class="mi-addr">
      <div class="mi-addr-cell">
        <div class="mi-addr-label">Bill To</div>
        <div class="mi-addr-name">${escapeHtml(data.customer.name)}</div>
        ${addrLines(data.customer.billTo)}
        ${
          data.customer.gstin
            ? `<span class="mi-addr-line" style="margin-top:4px">GSTIN&nbsp;${escapeHtml(data.customer.gstin)}</span>`
            : ""
        }
      </div>
      <div class="mi-addr-cell">
        <div class="mi-addr-label">Ship To</div>
        ${addrLines(data.customer.shipTo || data.customer.billTo)}
      </div>
    </div>

    <!-- LINE ITEMS -->
    <div class="mi-table-wrap">
      <table class="mi-table">
        <thead>
          <tr>
            <th class="t-no" rowspan="2">#</th>
            <th class="t-desc" rowspan="2">Item &amp; Description</th>
            <th class="t-qty" rowspan="2">Qty</th>
            <th class="t-rate" rowspan="2">Rate (₹)</th>
            <th colspan="2" style="text-align:center">CGST</th>
            <th colspan="2" style="text-align:center">SGST</th>
            <th class="t-amt" rowspan="2">Amount (₹)</th>
          </tr>
          <tr class="mi-gst-sub">
            <th class="t-cp">%</th>
            <th class="t-ca">Amt (₹)</th>
            <th class="t-sp">%</th>
            <th class="t-sa">Amt (₹)</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>

    <!-- FOOTER -->
    <div class="mi-footer">
      <div class="mi-words">
        <b>Total In Words</b>
        ${toWords(rounded)}
      </div>
      <div class="mi-summary">
        <div class="mi-srow mi-ssep"><span>Sub Total</span><span>${inr(subTotal)}</span></div>
        ${gstSummaryHTML}
        <div class="mi-srow"><span>Rounding</span><span>${rounding >= 0 ? "+" : ""}${inr(Math.abs(rounding))}</span></div>
        <div class="mi-srow mi-stotal"><span>Total</span><span>₹&nbsp;${inr(rounded)}</span></div>
        <div class="mi-srow"><span>Payment Made</span><span>(–)&nbsp;${inr(paid)}</span></div>
        <div class="mi-srow mi-sbalance"><span>Balance Due</span><span>₹&nbsp;${inr(balance)}</span></div>
      </div>
    </div>

  </div>
</div>`;
}

export function renderMithronInvoiceHtml(data: MithronInvoiceInput, options?: { showToolbar?: boolean }) {
  const showToolbar = options?.showToolbar !== false;
  const body = renderMithronInvoiceBody(data);
  const invNum = `INV-${String(data.serial).padStart(5, "0")}/${data.financialYr}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Invoice ${invNum}</title>
<style>${PAGE_SHELL_CSS}${CSS}</style>
</head>
<body>
${showToolbar ? `<button class="print-btn" onclick="window.print()">🖨 Print / Save PDF</button>` : ""}
${body}
</body>
</html>`;
}
