import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Clipboard, ExternalLink, FilePlus2, LoaderCircle, Pencil, Send } from "lucide-react";
import { Link } from "react-router-dom";
import Button, { ButtonLink } from "../components/Button";
import { useToast } from "../components/Toast";
import { useInvoiceData } from "../context/InvoiceDataContext";
import { fetchAgencyProposals, markProposalSent } from "../lib/proposal";
import type { Proposal, ProposalStatus } from "../lib/proposal";
import { formatDate, formatIDR } from "../lib/format";

const STATUS_STYLES: Record<ProposalStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-blue-100 text-blue-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
  PAID: "bg-violet-100 text-violet-700",
  EXPIRED: "bg-amber-100 text-amber-700",
};
const PAGE_SIZE = 10;

export default function ProposalDashboard() {
  const { user, activeCompanyId, activeCompany } = useInvoiceData();
  const { showToast } = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!user || !activeCompanyId) {
      setProposals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setProposals([]);
    try {
      setProposals(await fetchAgencyProposals(user.id, activeCompanyId));
    } catch (error) {
      console.error("Failed to load proposals:", error);
      setLoadError(error instanceof Error ? error.message : "Proposal list could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [user, activeCompanyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [activeCompanyId]);

  const pageCount = Math.max(1, Math.ceil(proposals.length / PAGE_SIZE));
  const paginatedProposals = useMemo(
    () => proposals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, proposals]
  );

  const copyLink = async (proposal: Proposal) => {
    const url = `${window.location.origin}/p/${proposal.token}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Client proposal link copied.");
    } catch (error) {
      console.error("Failed to copy proposal link:", error);
      showToast(`Could not copy the link. Copy it manually: ${url}`, "error");
    }
  };

  const sendProposal = async (proposal: Proposal) => {
    if (!user || !activeCompanyId) return;
    setPendingId(proposal.id);
    try {
      await markProposalSent(proposal.id, user.id, activeCompanyId);
      setProposals((current) =>
        current.map((item) => (item.id === proposal.id ? { ...item, status: "SENT" } : item))
      );
      showToast("Proposal marked as sent.");
      await copyLink(proposal);
    } catch (error) {
      console.error("Failed to mark proposal as sent:", error);
      showToast(error instanceof Error ? error.message : "Proposal could not be marked as sent.", "error");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Manage client proposals</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Proposals</h2>
          <p className="mt-1 text-sm text-slate-500">
            Workspace: <span className="font-semibold text-slate-700">{activeCompany?.companyName ?? "Loading…"}</span>
          </p>
        </div>
        <ButtonLink to="/proposals/new">
          <FilePlus2 className="h-4 w-4" />
          Create New Proposal
        </ButtonLink>
      </div>

      {loadError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p>{loadError}</p>
          <button type="button" onClick={() => void load()} className="mt-2 font-semibold underline">
            Try again
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="font-bold text-slate-900">Your proposals in this workspace</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Loading proposals…
          </div>
        ) : proposals.length ? (
          <div className="divide-y divide-slate-100">
            {paginatedProposals.map((proposal) => (
              <article key={proposal.id} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate font-bold text-slate-900">{proposal.title}</h4>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[proposal.status]}`}>
                      {proposal.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {proposal.client_name}
                    {proposal.client_company ? ` · ${proposal.client_company}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDate(proposal.created_at.slice(0, 10))} · {formatIDR(Number(proposal.total_amount ?? proposal.base_price))}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {proposal.status !== "APPROVED" && proposal.status !== "PAID" && (
                    <ButtonLink
                      to={`/proposals/${proposal.id}/edit`}
                      variant="secondary"
                      aria-label={`Edit ${proposal.title}`}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </ButtonLink>
                  )}
                  {proposal.status === "DRAFT" && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pendingId === proposal.id}
                      onClick={() => void sendProposal(proposal)}
                    >
                      <Send className="h-4 w-4" />
                      Mark sent & copy link
                    </Button>
                  )}
                  {proposal.status !== "DRAFT" && (
                    <Button type="button" variant="secondary" onClick={() => void copyLink(proposal)}>
                      <Clipboard className="h-4 w-4" />
                      Copy client link
                    </Button>
                  )}
                  <Link
                    to={`/p/${proposal.token}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open public view for ${proposal.title}`}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : !loadError ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <FilePlus2 className="h-5 w-5" />
            </span>
            <h4 className="mt-4 font-bold text-slate-900">No proposals yet</h4>
            <p className="mt-1 max-w-sm text-sm text-slate-500">Create a proposal and share a public link with your client.</p>
            <ButtonLink to="/proposals/new" className="mt-5">
              Create New Proposal
            </ButtonLink>
          </div>
        ) : null}
        {!loading && proposals.length > PAGE_SIZE && (
          <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, proposals.length)} of {proposals.length}
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="px-2 text-sm font-semibold tabular-nums text-slate-600">
                {page} / {pageCount}
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={page >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
