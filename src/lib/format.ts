import type { Invoice, InvoiceStatus } from "../types";

export type InvoiceViewState = InvoiceStatus | "OVERDUE" | "PAYMENT_REPORTED";

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

export function getInvoiceState(
  invoice: Pick<Invoice, "status" | "dueDate" | "paymentReportedAt">,
  today: Date = new Date()
): InvoiceViewState {
  if (invoice.status === "PAID") return "PAID";
  if (invoice.status === "FAILED") return "FAILED";
  if (invoice.status === "DRAFT") return "DRAFT";
  if (invoice.status === "PENDING" && invoice.paymentReportedAt) return "PAYMENT_REPORTED";
  if (invoice.status === "PENDING" && invoice.dueDate && invoice.dueDate < toISODate(today)) {
    return "OVERDUE";
  }
  return invoice.status;
}

export function getInvoiceBadgeLabel(state: InvoiceViewState | string): string {
  switch (state) {
    case "PAID":
      return "Paid";
    case "PENDING":
      return "Pending";
    case "OVERDUE":
      return "Overdue";
    case "PAYMENT_REPORTED":
      return "Payment Reported";
    case "DRAFT":
      return "Draft";
    case "FAILED":
      return "Failed";
    default:
      return "Pending";
  }
}

/** Backward-compatible alias used by older pages. */
export function getDisplayStatus(
  invoice: Invoice,
  today: Date = new Date()
): InvoiceViewState {
  return getInvoiceState(invoice, today);
}

export function isPaymentReported(invoice: Invoice): boolean {
  return getInvoiceState(invoice) === "PAYMENT_REPORTED";
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}