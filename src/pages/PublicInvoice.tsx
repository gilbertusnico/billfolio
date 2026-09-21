import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, CreditCard, FileQuestion, LoaderCircle, Printer, TriangleAlert } from "lucide-react";
import { sanitizeStyling, supabase } from "../lib/api";
import { getDisplayStatus } from "../lib/format";
import { loadMidtransSnap } from "../lib/midtrans";
import ConfirmDialog from "../components/ConfirmDialog";
import InvoicePreview from "../components/InvoicePreview";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import type {
  BankSnapshot,
  ClientSnapshot,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  Profile,
} from "../types";

/* ---------------------------------------------------------------------------
 * Raw payload shape returned by public.get_public_invoice (see migration
 * 0005_public_invoice_rpc.sql). Keys are snake_case because RPCs return jsonb
 * built server-side.
 * ------------------------------------------------------------------------- */

interface RawInvoice {
  id: string;
  number: string;
  client_snapshot: ClientSnapshot | null;
  project_name: string | null;
  invoice_date: string;
  due_date: string;
  tax_rate: number | string;
  discount: number | string;
  subtotal: number | string;
  tax_amount: number | string;
  grand_total: number | string;
  bank_snapshot: BankSnapshot | null;
  notes: string | null;
  status: InvoiceStatus;
  paid_at: string | null;
  items: InvoiceItem[];
  created_at: string;
  updated_at: string;
}

interface RawCompany {
  name: string;
  email: string | null;
  address: string | null;
  logo_url: string | null;
  styling: unknown;
}

interface PublicPayload {
  invoice: RawInvoice;
  company: RawCompany;
}

/** Treat empty JSON objects (server-side coalesce) as "no snapshot". */
function snapshotOrNull<T>(value: T | null | undefined): T | null {
  if (!value) return null;
  if (typeof value === "object" && Object.keys(value as object).length === 0) return null;
  return value;
}

function toInvoice(raw: RawInvoice): Invoice {
  return {
    id: raw.id,
    number: raw.number,
    clientId: null,
    clientSnapshot: snapshotOrNull(raw.client_snapshot) as ClientSnapshot | null,
    projectName: raw.project_name ?? "",
    invoiceDate: raw.invoice_date,
    dueDate: raw.due_date,
    items: Array.isArray(raw.items) ? raw.items : [],
    taxRate: Number(raw.tax_rate) || 0,
    discount: Number(raw.discount) || 0,
    subtotal: Number(raw.subtotal) || 0,
    taxAmount: Number(raw.tax_amount) || 0,
    grandTotal: Number(raw.grand_total) || 0,
    bankAccountId: null,
    bankSnapshot: snapshotOrNull(raw.bank_snapshot) as BankSnapshot | null,
    notes: raw.notes ?? "",
    status: raw.status ?? "DRAFT",
    paidAt: raw.paid_at ?? null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function toProfile(company: RawCompany): Profile {
  return {
    companyName: company.name,
    email: company.email ?? "",
    address: company.address ?? "",
    logoUrl: company.logo_url ?? "",
  };
}

export default function PublicInvoice() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();

  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [snapToken, setSnapToken] = useState<string | null>(null);
  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    (async () => {
      if (!id) {
        if (alive) setError("missing");
        return;
      }
      const { data, error: rpcError } = await supabase.rpc("get_public_invoice", {
        p_invoice_id: id,
      });
      if (!alive) return;
      if (rpcError) {
        console.error("get_public_invoice failed", rpcError);
        setError("failed");
        setLoading(false);
        return;
      }
      const payload = data as PublicPayload | null;
      if (!payload?.invoice || !payload?.company) {
        setError("missing");
        setLoading(false);
        return;
      }
      setPayload(payload);
      setSnapToken(null);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const invoice = payload ? toInvoice(payload.invoice) : null;
  const displayStatus = invoice ? getDisplayStatus(invoice) : null;
  const template = payload ? sanitizeStyling(payload.company.styling).template : null;
  const profile = payload ? toProfile(payload.company) : null;

  const handleMarkPaid = async () => {
    if (!payload || !id || marking) return;
    setMarking(true);
    const { error: rpcError } = await supabase.rpc("mark_invoice_paid", {
      p_invoice_id: id,
    });
    setMarking(false);
    if (rpcError) {
      console.error("mark_invoice_paid failed", rpcError);
      showToast("We couldn't update the status — check your connection and try again.", "error");
      return;
    }
    setPayload((p) =>
      p
        ? { ...p, invoice: { ...p.invoice, status: "PAID", paid_at: new Date().toISOString() } }
        : p
    );
    showToast("Thank you — this invoice is now marked as PAID.");
  };

  const handlePayNow = async () => {
    if (!id || !invoice || paying || displayStatus !== "PENDING") return;
    setPaying(true);
    try {
      let token = snapToken;
      if (!token) {
        const { data, error: functionError } = await supabase.functions.invoke("create-snap-token", {
          body: { invoice_id: id },
        });
        if (functionError) throw new Error(functionError.message || "Could not create payment session.");

        const result = data as { token?: string; error?: string } | null;
        if (!result?.token) throw new Error(result?.error || "Could not create payment session.");
        token = result.token;
        setSnapToken(token);
      }

      const snap = await loadMidtransSnap();
      snap.pay(token, {
        onSuccess: () => {
          showToast("Pembayaran Berhasil! Status invoice akan diperbarui otomatis.");
          window.setTimeout(() => window.location.reload(), 1800);
        },
        onPending: () => {
          showToast("Pembayaran masih pending. Selesaikan pembayaran sesuai instruksi Midtrans.", "info");
          setPaying(false);
        },
        onError: () => {
          showToast("Pembayaran gagal. Silakan coba lagi.", "error");
          setPaying(false);
        },
        onClose: () => {
          showToast("Popup pembayaran ditutup sebelum pembayaran selesai.", "info");
          setPaying(false);
        },
      });
    } catch (error) {
      console.error("Midtrans payment failed", error);
      showToast(error instanceof Error ? error.message : "Pembayaran gagal dimulai.", "error");
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100">
        <LoaderCircle className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
        <p className="text-sm font-medium text-slate-500">Loading invoice…</p>
      </div>
    );
  }

  if (error || !invoice || !profile || !template) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200">
          <FileQuestion className="h-7 w-7 text-slate-500" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-slate-900">Invoice not found</h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            This link doesn&apos;t point to an invoice — it may have been deleted, or the link was
            mistyped. Check with the sender that they shared the right link.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 ease-out hover:bg-blue-700 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Go back
        </button>
      </div>
    );
  }

  const isPaid = displayStatus === "PAID";
  const isActionable = displayStatus === "PENDING" || displayStatus === "OVERDUE";

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Slim public bar — hidden automatically when printing (print CSS hides header/button) */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4 sm:px-6">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-sm font-extrabold text-white">
            B
          </span>
          <span className="text-sm font-bold tracking-tight text-slate-900">BillFolio</span>
          <span className="ml-auto">
            <StatusBadge status={displayStatus ?? "DRAFT"} />
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-3 py-6 sm:px-6 sm:py-8 print:max-w-none print:p-0">
        <InvoicePreview
          number={invoice.number}
          invoiceDate={invoice.invoiceDate}
          dueDate={invoice.dueDate}
          projectName={invoice.projectName}
          client={invoice.clientSnapshot}
          items={invoice.items}
          taxRate={invoice.taxRate}
          discount={invoice.discount}
          calculatedTotals={{
            subtotal: invoice.subtotal ?? 0,
            taxAmount: invoice.taxAmount ?? 0,
            grandTotal: invoice.grandTotal ?? 0,
          }}
          bank={invoice.bankSnapshot}
          notes={invoice.notes}
          profile={profile}
          template={template}
        />

        {/* CTA panel — never printed */}
        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-300 ease-out hover:border-slate-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-[0.97]"
          >
            <Printer className="h-4 w-4" />
            Print Invoice
          </button>

          {isPaid ? (
            <span className="inline-flex cursor-default items-center justify-center gap-2 rounded-xl bg-emerald-100 px-5 py-3 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              PAID
            </span>
          ) : isActionable ? (
            <>
              {displayStatus === "PENDING" && (
                <button
                  type="button"
                  onClick={() => void handlePayNow()}
                  disabled={paying}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-all duration-300 ease-out hover:bg-blue-700 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60"
                >
                  {paying ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <CreditCard className="h-4 w-4" />}
                  {paying ? "Preparing payment…" : "Bayar Sekarang"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmPaidOpen(true)}
                disabled={marking}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 transition-all duration-300 ease-out hover:bg-emerald-700 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60"
              >
                {marking ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" />}
                {marking ? "Updating…" : "Press this button if you've PAID"}
              </button>
            </>
          ) : (
            <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 py-3 text-sm font-medium text-slate-500">
              <TriangleAlert className="h-4 w-4" aria-hidden />
              This invoice is a draft and hasn&apos;t been sent yet.
            </span>
          )}
        </div>

        {isPaid && (
          <p className="mt-4 text-center text-sm font-semibold text-emerald-700 print:hidden">
            Terima kasih — pembayaran untuk {invoice.number} sudah tercatat.
          </p>
        )}
      </main>

      {/* Double-confirm — the client can't flip the invoice to PAID by accident. */}
      <ConfirmDialog
        open={confirmPaidOpen}
        title="Confirm your payment"
        message={
          <>
            Please double-check before confirming — once marked as PAID, the sender is
            notified instantly that the full amount for{" "}
            <span className="font-semibold">{invoice.number}</span> has been transferred.
          </>
        }
        confirmLabel="Yes, I've paid"
        cancelLabel="Not yet"
        confirmVariant="primary"
        onConfirm={() => {
          setConfirmPaidOpen(false);
          void handleMarkPaid();
        }}
        onCancel={() => setConfirmPaidOpen(false)}
      />
    </div>
  );
}