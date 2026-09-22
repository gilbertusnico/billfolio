import type { Invoice, InvoiceItem } from "../types";

function invoiceSegment(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[\\/]/g, "")
    .replace(/[-_]+$/g, "");
  return normalized || fallback;
}

/** Creates a company-identifiable number, e.g. INV/NICOcompany/0005. */
export function buildInvoiceNumber(prefix: string, companyName: string, sequence: number): string {
  const safePrefix = invoiceSegment(prefix, "INV");
  const safeCompany = invoiceSegment(companyName, "COMPANY");
  const safeSequence = Math.max(0, Math.floor(Number(sequence) || 0));
  return `${safePrefix}/${safeCompany}/${String(safeSequence).padStart(4, "0")}`;
}

export function itemAmount(item: InvoiceItem): number {
  const qty = Number(item.quantity) || 0;
  const price = Number(item.unitPrice) || 0;
  return qty * price;
}

export function invoiceSubtotal(invoice: Pick<Invoice, "items">): number {
  if ("subtotal" in invoice && typeof invoice.subtotal === "number") return invoice.subtotal;
  return invoice.items.reduce((sum, item) => sum + itemAmount(item), 0);
}

export function taxAmount(invoice: Pick<Invoice, "items" | "taxRate">): number {
  if ("taxAmount" in invoice && typeof invoice.taxAmount === "number") return invoice.taxAmount;
  const rate = Number(invoice.taxRate) || 0;
  return (invoiceSubtotal(invoice) * rate) / 100;
}

export function grandTotal(invoice: Pick<Invoice, "items" | "taxRate" | "discount">): number {
  if ("grandTotal" in invoice && typeof invoice.grandTotal === "number") return invoice.grandTotal;
  return invoiceSubtotal(invoice) - (Number(invoice.discount) || 0) + taxAmount(invoice);
}
