import type { InvoiceStatus } from "../types";

const STYLES: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  OVERDUE: "bg-rose-100 text-rose-700",
  DRAFT: "bg-slate-100 text-slate-600",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status] ?? STYLES.DRAFT}`}
    >
      {status}
    </span>
  );
}

export type { InvoiceStatus };