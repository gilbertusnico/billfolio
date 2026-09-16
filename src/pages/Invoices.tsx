import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, FileText, Plus, Receipt, Search } from "lucide-react";
import { useInvoiceData } from "../context/InvoiceDataContext";
import { formatDate, formatIDR, getDisplayStatus } from "../lib/format";
import { grandTotal } from "../lib/invoice";
import StatusBadge from "../components/StatusBadge";
import { Skeleton, SkeletonRows } from "../components/Skeleton";
import { ButtonLink } from "../components/Button";

const PAGE_SIZE = 8;

export default function Invoices() {
  const { data, isLoading } = useInvoiceData();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...data.invoices].sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.updatedAt.localeCompare(a.updatedAt)
    );
    if (!q) return sorted;
    return sorted.filter(
      (inv) =>
        inv.number.toLowerCase().includes(q) ||
        (inv.clientSnapshot?.name ?? "").toLowerCase().includes(q)
    );
  }, [data.invoices, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, filtered.length);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-11 w-full max-w-sm" />
        <SkeletonRows rows={8} />
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by invoice number or client…"
            aria-label="Search invoices"
            className="input py-2.5 pl-10 pr-4"
          />
        </div>
        <p className="text-sm font-medium text-slate-500" aria-live="polite">
          {filtered.length === 0
            ? "No invoices"
            : `Showing ${from}–${to} of ${filtered.length}`}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg">
        {data.invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Receipt className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm font-bold text-slate-900">No invoices yet</p>
            <p className="max-w-xs text-sm leading-relaxed text-slate-500">
              Build your first invoice with line items, a live preview, and one-click PDF
              printing.
            </p>
            <ButtonLink to="/invoices/new" className="mt-1">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              New Invoice
            </ButtonLink>
          </div>
        ) : pageItems.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <Search className="h-7 w-7 text-slate-300" />
            <p className="text-sm font-bold text-slate-900">No invoices match your search</p>
            <p className="text-sm text-slate-500">
              Try a different number or client name, or clear the search.
            </p>
            <button
              onClick={() => setQuery("")}
              className="mt-1 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold text-blue-600 transition-colors duration-200 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Clear search
            </button>
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
                {pageItems.map((inv) => (
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
                    className="cursor-pointer border-b border-slate-50 transition-colors duration-200 last:border-0 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <td className="px-5 py-3.5 font-bold text-slate-900">{inv.number}</td>
                    <td className="px-5 py-3.5 text-slate-600">
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-slate-300" />
                        {inv.clientSnapshot?.name ?? "—"}
                      </span>
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

        {data.invoices.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
            <p className="text-xs font-medium text-slate-500">
              Page {safePage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                aria-label="Previous page"
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-[0.97]"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                aria-label="Next page"
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-[0.97]"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}