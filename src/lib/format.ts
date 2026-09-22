import type { Invoice, InvoiceStatus } from "../types";

const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Format a number as Indonesian Rupiah, e.g. "Rp 1.234.567". */
export function formatIDR(value: number): string {
  return idrFormatter.format(Number.isFinite(value) ? value : 0);
}

/** Local yyyy-mm-dd (avoids UTC timezone off-by-one from toISOString). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** A PENDING invoice whose due date has passed displays as OVERDUE. */
export function getDisplayStatus(
  invoice: Invoice,
  today: Date = new Date()
): InvoiceStatus | "OVERDUE" {
  if (invoice.status === "PENDING" && invoice.dueDate && invoice.dueDate < toISODate(today)) {
    return "OVERDUE";
  }
  return invoice.status;
}

export function isPaymentReported(invoice: Invoice): boolean {
  return invoice.status === "PENDING" && Boolean(invoice.paymentReportedAt);
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}