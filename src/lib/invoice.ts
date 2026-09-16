import type { Invoice, InvoiceItem } from "../types";

export function itemAmount(item: InvoiceItem): number {
  const qty = Number(item.quantity) || 0;
  const price = Number(item.unitPrice) || 0;
  return qty * price;
}

export function invoiceSubtotal(invoice: Pick<Invoice, "items">): number {
  return invoice.items.reduce((sum, item) => sum + itemAmount(item), 0);
}

export function taxAmount(invoice: Pick<Invoice, "items" | "taxRate">): number {
  const rate = Number(invoice.taxRate) || 0;
  return (invoiceSubtotal(invoice) * rate) / 100;
}

export function grandTotal(invoice: Pick<Invoice, "items" | "taxRate">): number {
  return invoiceSubtotal(invoice) + taxAmount(invoice);
}