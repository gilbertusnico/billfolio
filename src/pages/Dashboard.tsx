import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  FileText,
  Plus,
  Receipt,
  X,
} from "lucide-react";
import { useInvoiceData } from "../context/InvoiceDataContext";
import type { InvoiceStatus } from "../types";
import { formatDate, formatIDR, getDisplayStatus } from "../lib/format";
import { grandTotal } from "../lib/invoice";
import StatusBadge from "../components/StatusBadge";
import { Skeleton, SkeletonCards, SkeletonRows } from "../components/Skeleton";
import { ButtonLink } from "../components/Button";

type DashboardStatusFilter = "ALL" | InvoiceStatus | "OVERDUE";

export default function Dashboard() {
  const { data, isLoading } = useInvoiceData();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<DashboardStatusFilter>("ALL");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCards count={3} />
        <Skeleton className="h-7 w-44" />
        <SkeletonRows rows={5} />
      </div>
    );
  }

  const now = new Date();
  const invoices = data.invoices;

  const filtersActive = dateFrom !== "" || dateTo !== "" || statusFilter !== "ALL";

  // Filter by invoice-date range and display status (Overdue is resolved live from due date).
  const filtered = invoices.filter((inv) => {
    if (dateFrom && inv.invoiceDate < dateFrom) return false;
    if (dateTo && inv.invoiceDate > dateTo) return false;
    if (statusFilter !== "ALL" && getDisplayStatus(inv, now) !== statusFilter) return false;
    return true;
  });

  const revenue = filtered
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + grandTotal(i), 0);
  const pendingInvoices = filtered.filter((i) => getDisplayStatus(i, now) === "PENDING");
  const pendingTotal = pendingInvoices.reduce((sum, i) => sum + grandTotal(i), 0);
  const overdueInvoices = filtered.filter((i) => getDisplayStatus(i, now) === "OVERDUE");

  // Newest first by creation date; when filters are active show every match, otherwise the 5 most recent.
  const sorted = [...filtered].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.updatedAt.localeCompare(a.updatedAt)
  );
  const recent = filtersActive ? sorted : sorted.slice(0, 5);

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setStatusFilter("ALL");
  };

  const cards = [
    {
      label: "Total Revenue",
      value: formatIDR(revenue),
      hint: "from paid invoices",
      icon: Receipt,
      accent: "via-blue-600/70",
      chip: "bg-blue-50 text-blue-600",
    },
    {
      label: "Pending Invoices",
      value: formatIDR(pendingTotal),
      hint: `${pendingInvoices.length} invoice${pendingInvoices.length === 1 ? "" : "s"} awaiting payment`,
      icon: FileText,
      accent: "via-amber-500/70",
      chip: "bg-amber-50 text-amber-600",
    },
    {
      label: "Overdue",
      value: String(overdueInvoices.length),
      hint: "invoice(s) past their due date",
      icon: CircleAlert,
      accent: "via-rose-500/70",
      chip: "bg-rose-50 text-rose-600",
    },
  ];

  return (
    <div className="space-y-6">
      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, hint, icon: Icon, accent, chip }) => (
          <article
            key={label}
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-lg"
          >
            <span
              className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent ${accent} to-transparent`}
            />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {label}
                </p>
                <p className="mt-2 truncate text-2xl font-extrabold tracking-tight text-slate-900">
                  {value}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-400">{hint}</p>
              </div>
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${chip}`}
              >
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </article>
        ))}
      </section>

      <section
        aria-label="Recent invoices"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold tracking-tight text-slate-900">
            {filtersActive ? "Invoices" : "Recent Invoices"}
          </h2>
          <Link
            to="/invoices"
            className="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-blue-600 transition-colors duration-200 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Filters: date range + status */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-slate-100 px-5 py-3.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dash-from" className="label">
              From
            </label>
            <input
              id="dash-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Invoices from date"
              className="input py-2"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dash-to" className="label">
              To
            </label>
            <input
              id="dash-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Invoices to date"
              className="input py-2"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dash-status" className="label">
              Status
            </label>
            <select
              id="dash-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DashboardStatusFilter)}
              className="input py-2"
            >
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING">Pending</option>
              <option value="OVERDUE">Overdue</option>
              <option value="PAID">Paid</option>
            </select>
          </div>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-[0.97]"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
          {filtersActive && (
            <p
              className="ml-auto self-center text-xs font-medium text-slate-500"
              aria-live="polite"
            >
              Showing {filtered.length} of {invoices.length} invoice
              {invoices.length === 1 ? "" : "s"}
            </p>
          )}
        </div>

        {recent.length === 0 && filtersActive ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <CalendarDays className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm font-bold text-slate-900">No invoices match your filters</p>
            <p className="max-w-sm text-sm leading-relaxed text-slate-500">
              Nothing falls in this date range or status — try widening the range or picking
              another status.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-1 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold text-blue-600 transition-colors duration-200 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Clear filters
            </button>
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Receipt className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm font-bold text-slate-900">No invoices yet</p>
            <p className="max-w-xs text-sm leading-relaxed text-slate-500">
              Create your first invoice and it will show up here — ready to preview and print as
              an A4 PDF.
            </p>
            <ButtonLink to="/invoices/new" className="mt-1">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              New Invoice
            </ButtonLink>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th scope="col" className="px-5 py-3 font-semibold">Invoice</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Client</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Amount</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((inv) => (
                  <tr
                    key={inv.id}
                    tabIndex={0}
                    role="link"
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/invoices/${inv.id}`);
                      }
                    }}
                    className="cursor-pointer border-b border-slate-50 transition-colors duration-200 last:border-0 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3.5 font-bold text-slate-900">{inv.number}</td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {inv.clientSnapshot?.name ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-slate-900">
                      {formatIDR(grandTotal(inv))}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={getDisplayStatus(inv, now)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}