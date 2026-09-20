import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Plus,
  Receipt,
  Search,
  X,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useInvoiceData } from "../context/InvoiceDataContext";
import { useToast } from "../components/Toast";
import { formatDate, formatIDR, getDisplayStatus, toISODate } from "../lib/format";
import { grandTotal, invoiceSubtotal, taxAmount } from "../lib/invoice";
import { buildWhatsAppMessage, whatsAppShareUrl } from "../lib/phone";
import { downloadCsv } from "../lib/csv";
import StatusBadge from "../components/StatusBadge";
import { Skeleton, SkeletonRows } from "../components/Skeleton";
import Button, { ButtonLink } from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import type { Invoice, InvoiceStatus } from "../types";

const PAGE_SIZE = 8;

type SortKey = "date" | "amount";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

export default function Invoices() {
  const { data, isLoading, upsertInvoice, updateSettings } = useInvoiceData();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusTab, setStatusTab] = useState<InvoiceStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [pendingPaidInvoice, setPendingPaidInvoice] = useState<Invoice | null>(null);
  const [sort, setSort] = useState<SortState>(null);

  /** Toggle column sort — first click on a new column starts ascending. */
  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev && prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { key, dir: "asc" };
    });
    setPage(1);
  };

  /** Quick admin action: flip a non-paid invoice to PAID straight from the table. */
  const markPaid = (inv: Invoice) => {
    upsertInvoice({
      ...inv,
      status: "PAID",
      paidAt: inv.status === "PAID" ? inv.paidAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    showToast(`${inv.number} marked as PAID`);
    setPendingPaidInvoice(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();
    const list = data.invoices.filter((inv) => {
      if (
        q &&
        !inv.number.toLowerCase().includes(q) &&
        !(inv.clientSnapshot?.name ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      if (statusTab !== "ALL" && getDisplayStatus(inv, now) !== statusTab) return false;
      if (dateFrom && inv.invoiceDate < dateFrom) return false;
      if (dateTo && inv.invoiceDate > dateTo) return false;
      return true;
    });
    // Active column sort, else newest-first (default view).
    list.sort((a, b) => {
      if (sort) {
        const cmp =
          sort.key === "date"
            ? a.invoiceDate.localeCompare(b.invoiceDate)
            : grandTotal(a) - grandTotal(b);
        if (cmp !== 0) return sort.dir === "asc" ? cmp : -cmp;
      }
      return b.createdAt.localeCompare(a.createdAt) || b.updatedAt.localeCompare(a.updatedAt);
    });
    return list;
  }, [data.invoices, query, dateFrom, dateTo, statusTab, sort]);

  const filtersActive = query.trim() !== "" || dateFrom !== "" || dateTo !== "" || statusTab !== "ALL";

  const clearFilters = () => {
    setQuery("");
    setDateFrom("");
    setDateTo("");
    setStatusTab("ALL");
    setPage(1);
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: 0 };
    const now = new Date();
    for (const inv of data.invoices) {
      if (dateFrom && inv.invoiceDate < dateFrom) continue;
      if (dateTo && inv.invoiceDate > dateTo) continue;
      counts.ALL += 1;
      const s = getDisplayStatus(inv, now);
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [data.invoices, dateFrom, dateTo]);

  /** Export the current (search-filtered) list as an Excel-readable CSV. */
  const exportCsv = () => {
    if (filtered.length === 0) {
      showToast("Nothing to export — no invoices match the current view", "error");
      return;
    }
    const slug =
      (data.profile.companyName || "invoices").replace(/[^\w\- ]+/g, "").trim() || "invoices";
    downloadCsv(
      `${slug}-invoices-${toISODate(new Date())}.csv`,
      [
        "Invoice Number",
        "Client Name",
        "Client Company",
        "Client Email",
        "Client Phone",
        "Project",
        "Invoice Date",
        "Due Date",
        "Status",
        "Subtotal",
        "Tax Rate (%)",
        "Tax Amount",
        "Total",
      ],
      filtered.map((inv) => [
        inv.number,
        inv.clientSnapshot?.name ?? "",
        inv.clientSnapshot?.company ?? "",
        inv.clientSnapshot?.email ?? "",
        inv.clientSnapshot?.phone ?? "",
        inv.projectName,
        inv.invoiceDate,
        inv.dueDate,
        getDisplayStatus(inv),
        invoiceSubtotal(inv),
        inv.taxRate,
        taxAmount(inv),
        grandTotal(inv),
      ])
    );
    showToast(`Exported ${filtered.length} invoice${filtered.length === 1 ? "" : "s"} to CSV`);
  };

  /**
   * Create a fresh DRAFT copy with the next sequence number and today's dates,
   * then open it in the builder so the user can review before sending.
   */
  const duplicateInvoice = (inv: Invoice) => {
    const today = new Date();
    const due = new Date(today);
    due.setDate(due.getDate() + 14);
    const nowIso = today.toISOString();
    const number = `${data.settings.invoicePrefix}${String(data.settings.lastSequence + 1).padStart(4, "0")}`;
    const copy: Invoice = {
      id: crypto.randomUUID(),
      number,
      clientId: inv.clientId,
      clientSnapshot: inv.clientSnapshot,
      projectName: inv.projectName,
      invoiceDate: toISODate(today),
      dueDate: toISODate(due),
      items: inv.items.map((it) => ({ ...it, id: crypto.randomUUID() })),
      taxRate: inv.taxRate,
      bankAccountId: inv.bankAccountId,
      bankSnapshot: inv.bankSnapshot,
      notes: inv.notes,
      status: "DRAFT",
      paidAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    void upsertInvoice(copy).then((ok) => {
      if (!ok) return;
      updateSettings({ ...data.settings, lastSequence: data.settings.lastSequence + 1 });
      showToast(`${number} duplicated — ready to edit`);
      navigate(`/invoices/${copy.id}`);
    });
  };

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
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-slate-500" aria-live="polite">
            {filtered.length === 0
              ? "No invoices"
              : `Showing ${from}–${to} of ${filtered.length}`}
          </p>
          <Button
            variant="secondary"
            type="button"
            className="shrink-0 py-2"
            disabled={data.invoices.length === 0}
            onClick={exportCsv}
          >
            <Download aria-hidden className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invoices-from" className="label">
            From
          </label>
          <input
            id="invoices-from"
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            aria-label="Invoices from date"
            className="input py-2"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invoices-to" className="label">
            To
          </label>
          <input
            id="invoices-to"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            aria-label="Invoices to date"
            className="input py-2"
          />
        </div>
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-[0.97]"
          >
            <X className="h-4 w-4" />
            Clear filters
          </button>
        )}
        {dateFrom || dateTo ? (
          <p className="ml-auto self-center text-xs font-medium text-slate-500" aria-live="polite">
            Filtering by invoice date
          </p>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Filter invoices by status"
        className="flex flex-wrap items-center gap-1.5"
      >
        {(["ALL", "PENDING", "PAID", "OVERDUE"] as const).map((tab) => {
          const active = statusTab === tab;
          return (
            <button
              key={tab}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => {
                setStatusTab(tab);
                setPage(1);
              }}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-[0.97] ${
                active
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
              }`}
            >
              {tab === "ALL" ? "All" : tab}{" "}
              <span className={active ? "text-blue-100" : "text-slate-400"}>
                {statusCounts[tab] ?? 0}
              </span>
            </button>
          );
        })}
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
              Try a different number or client name, or clear the filters.
            </p>
            <button
              onClick={clearFilters}
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
                  <th
                    scope="col"
                    aria-sort={sort?.key === "date" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className="px-5 py-3 font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("date")}
                      className={`group inline-flex cursor-pointer items-center gap-1 rounded transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                        sort?.key === "date" ? "text-blue-600" : "hover:text-blue-600"
                      }`}
                    >
                      Date
                      {sort?.key === "date" ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ArrowUp className="h-3.5 w-3.5 opacity-0 transition-opacity duration-200 group-hover:opacity-50" />
                      )}
                    </button>
                  </th>
                  <th
                    scope="col"
                    aria-sort={sort?.key === "amount" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className="px-5 py-3 text-right font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("amount")}
                      className={`group inline-flex cursor-pointer items-center gap-1 rounded transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                        sort?.key === "amount" ? "text-blue-600" : "hover:text-blue-600"
                      }`}
                    >
                      Amount
                      {sort?.key === "amount" ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ArrowUp className="h-3.5 w-3.5 opacity-0 transition-opacity duration-200 group-hover:opacity-50" />
                      )}
                    </button>
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((inv) => {
                  const display = getDisplayStatus(inv, now);
                  // Share link exists once the invoice is PENDING — never for DRAFT.
                  const shareable = display === "PENDING" || display === "OVERDUE";
                  const phone =
                    data.clients.find((c) => c.id === inv.clientId)?.phone?.trim() ||
                    inv.clientSnapshot?.phone?.trim() ||
                    "";
                  const whatsappHref = shareable
                    ? whatsAppShareUrl(
                        phone,
                        buildWhatsAppMessage({
                          clientName: inv.clientSnapshot?.name ?? "Customer",
                          invoiceNumber: inv.number,
                          grandTotal: formatIDR(grandTotal(inv)),
                          link: `${window.location.origin}/i/${inv.id}`,
                        })
                      )
                    : null;
                  return (
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
                          <span className="flex flex-col leading-tight">
                            <span className="font-semibold text-slate-700">
                              {inv.clientSnapshot?.name ?? "—"}
                            </span>
                            {inv.clientSnapshot?.company && (
                              <span className="text-xs text-slate-400">
                                {inv.clientSnapshot.company}
                              </span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{formatDate(inv.invoiceDate)}</td>
                      <td className="px-5 py-3.5 text-right font-bold text-slate-900">
                        {formatIDR(grandTotal(inv))}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-1.5">
                          <StatusBadge status={display} />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateInvoice(inv);
                            }}
                            aria-label={`Duplicate ${inv.number} as a new draft`}
                            title="Duplicate as new draft"
                            className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors duration-200 hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 active:scale-[0.9]"
                          >
                            <Copy aria-hidden className="h-4 w-4" />
                          </button>
                          {shareable && (
                            <>
                              {whatsappHref ? (
                                <a
                                  href={whatsappHref}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Share ${inv.number} on WhatsApp`}
                                  title="Share on WhatsApp"
                                  className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors duration-200 hover:bg-emerald-50 hover:text-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500 active:scale-[0.9]"
                                >
                                  <SiWhatsapp aria-hidden className="h-4 w-4" />
                                </a>
                              ) : (
                                <span
                                  aria-hidden
                                  title="Add a phone number to this client to share on WhatsApp"
                                  className="cursor-not-allowed rounded-md p-1.5 text-slate-300"
                                >
                                  <SiWhatsapp aria-hidden className="h-4 w-4" />
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingPaidInvoice(inv);
                                }}
                                aria-label={`Mark ${inv.number} as PAID`}
                                title="Mark as PAID"
                                className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors duration-200 hover:bg-emerald-50 hover:text-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500 active:scale-[0.9]"
                              >
                                <CheckCircle2 aria-hidden className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
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
      <ConfirmDialog
        open={pendingPaidInvoice !== null}
        title="Double-confirm payment status"
        message={
          <>
            Are you sure you want to mark <strong>{pendingPaidInvoice?.number}</strong> as PAID?
            This will update the invoice status for your team.
          </>
        }
        confirmLabel="Yes, mark as PAID"
        confirmVariant="primary"
        onConfirm={() => {
          if (pendingPaidInvoice) markPaid(pendingPaidInvoice);
        }}
        onCancel={() => setPendingPaidInvoice(null)}
      />
    </div>
  );
}