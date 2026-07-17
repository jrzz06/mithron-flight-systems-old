/** Indian financial year (Apr–Mar), e.g. 26-27 */
export function financialYearFromDate(date: Date): string {
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = (startYear + 1) % 100;
  return `${String(startYear).slice(-2)}-${String(endYear).padStart(2, "0")}`;
}

export function formatInvoiceSerial(serial: number): string {
  return String(serial).padStart(5, "0");
}

function buildInvoiceNumber(prefix: string, financialYear: string, serial: number): string {
  return `${prefix}/${financialYear}/${formatInvoiceSerial(serial)}`;
}

export function buildTemplateInvoiceNumber(financialYear: string, serial: number): string {
  return `INV-${formatInvoiceSerial(serial)}/${financialYear}`;
}

export function formatInvoiceDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}
