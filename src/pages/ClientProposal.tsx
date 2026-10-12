import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, Receipt, XCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useToast } from "../components/Toast";
import SignatureCanvas from "../components/SignatureCanvas";
import { supabase } from "../lib/api";
import { ensureApprovedProposalInvoice, fetchPublicProposal, isProposalToken, respondToProposal } from "../lib/proposal";
import type { Proposal } from "../lib/proposal";
import { formatIDR } from "../lib/format";

export default function ClientProposal() {
  const { token = "" } = useParams();
  const { showToast } = useToast();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);

  const ensureInvoice = useCallback(async () => {
    setCreatingInvoice(true);
    setInvoiceError(null);
    try {
      const invoiceId = await ensureApprovedProposalInvoice(token);
      setProposal((current) => current ? { ...current, dp_invoice_id: invoiceId } : current);
    } catch (invoiceCreationError) {
      console.error("Failed to prepare approved proposal invoice:", invoiceCreationError);
      setInvoiceError(
        invoiceCreationError instanceof Error
          ? invoiceCreationError.message
          : "The DP invoice could not be prepared."
      );
      showToast("The proposal is approved, but its invoice could not be prepared.", "error");
    } finally {
      setCreatingInvoice(false);
    }
  }, [showToast, token]);

  useEffect(() => {
    let current = true;
    if (!isProposalToken(token)) {
      setError("This proposal link is invalid.");
      setLoading(false);
      return () => {
        current = false;
      };
    }
    setError(null);
    setInvoiceError(null);
    setProposal(null);
    setLoading(true);
    void fetchPublicProposal(token)
      .then((result) => {
        if (current) {
          setProposal(result);
          setSelectedAddonIds((result?.addons ?? []).filter((addon) => addon.is_selected).map((addon) => addon.id));
          if (!result) setError("This proposal could not be found.");
          if (result?.status === "APPROVED" && !result.dp_invoice_id) {
            void ensureInvoice();
          }
        }
      })
      .catch((fetchError: unknown) => {
        console.error("Failed to load public proposal:", fetchError);
        if (current) setError(fetchError instanceof Error ? fetchError.message : "Proposal could not be loaded.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [ensureInvoice, token]);

  useEffect(() => {
    let current = true;
    setSignatureUrl(null);
    setSignatureError(null);
    if (proposal?.status !== "APPROVED" || !proposal.client_signature_path) {
      return () => {
        current = false;
      };
    }

    void supabase.storage
      .from("proposal-assets")
      .createSignedUrl(proposal.client_signature_path, 60 * 60)
      .then(({ data, error: signedUrlError }) => {
        if (!current) return;
        if (signedUrlError) throw signedUrlError;
        setSignatureUrl(data.signedUrl);
      })
      .catch((loadError: unknown) => {
        console.error("Failed to load approved proposal signature:", loadError);
        if (current) setSignatureError("The client signature could not be displayed.");
      });

    return () => {
      current = false;
    };
  }, [proposal?.client_signature_path, proposal?.status]);

  const respond = async (answer: "APPROVED" | "REJECTED") => {
    if (!proposal) return;
    if (answer === "APPROVED" && (!hasSignature || !acceptedTerms)) {
      showToast("Add your signature and accept the proposal terms before approving.", "error");
      return;
    }
    setResponding(true);
    try {
      const selectedIds = answer === "APPROVED" ? selectedAddonIds : [];
      let signatureUrl: string | null = null;
      if (answer === "APPROVED") {
        const canvas = signatureCanvasRef.current;
        if (!canvas) throw new Error("Signature canvas is unavailable. Please reload and try again.");
        const signatureBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png")
        );
        if (!signatureBlob) throw new Error("Could not export your signature. Please sign again.");

        const signaturePath = `signatures/${token}/signature.png`;
        const { error: uploadError } = await supabase.storage
          .from("proposal-assets")
          .upload(signaturePath, signatureBlob, { contentType: "image/png", upsert: true });
        if (uploadError) throw uploadError;
        signatureUrl = supabase.storage.from("proposal-assets").getPublicUrl(signaturePath).data.publicUrl;
      }

      const response = await respondToProposal(token, answer, selectedIds, signatureUrl);
      if (answer === "APPROVED" && !response.invoiceId) {
        throw new Error("The proposal was approved, but its DP invoice was not created.");
      }
      const total = Number(proposal.base_price) + (proposal.addons ?? [])
        .filter((addon) => addon.is_required || selectedIds.includes(addon.id))
        .reduce((sum, addon) => sum + Number(addon.price), 0);
      setProposal({
        ...proposal,
        status: answer,
        dp_invoice_id: response.invoiceId,
        client_signature_path: answer === "APPROVED" ? `signatures/${token}/signature.png` : null,
        total_amount: answer === "APPROVED" ? total : proposal.total_amount,
        dp_amount: answer === "APPROVED" ? total * (Number(proposal.dp_percentage) / 100) : proposal.dp_amount,
        client_signature_url: signatureUrl,
        addons: (proposal.addons ?? []).map((addon) => ({
          ...addon,
          is_selected: addon.is_required || selectedIds.includes(addon.id),
        })),
        approved_at: answer === "APPROVED" ? new Date().toISOString() : proposal.approved_at,
      });
      showToast(answer === "APPROVED" ? "Proposal approved. Thank you!" : "Your response was sent.");
    } catch (responseError) {
      console.error("Failed to submit proposal response:", responseError);
      showToast(responseError instanceof Error ? responseError.message : "Your response could not be saved.", "error");
    } finally {
      setResponding(false);
    }
  };

  const proposalStatus = proposal?.status;
  const canRespond = proposalStatus === "SENT";
  const selectedAddonTotal = (proposal?.addons ?? [])
    .filter((addon) => addon.is_required || selectedAddonIds.includes(addon.id))
    .reduce((sum, addon) => sum + Number(addon.price), 0);
  const currentTotal = proposal ? Number(proposal.base_price) + selectedAddonTotal : 0;
  const isApproved = proposalStatus === "APPROVED";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Receipt className="h-5 w-5" />
          </span>
          <div>
            <p className="font-extrabold tracking-tight text-slate-900">ProposalFolio</p>
            <p className="text-xs text-slate-500">Client proposal</p>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-16 text-sm text-slate-500">
            <LoaderCircle className="h-5 w-5 animate-spin" /> Loading proposal…
          </div>
        ) : error || !proposal ? (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
            <h1 className="mt-3 text-xl font-bold text-slate-900">Proposal unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">{error ?? "This proposal could not be found."}</p>
          </div>
        ) : (
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-br from-blue-50 to-white px-6 py-8 sm:px-9">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Project Proposal</p>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{proposal.title}</h1>
              <p className="mt-3 text-sm text-slate-600">Prepared for <span className="font-semibold text-slate-900">{proposal.client_name}</span>{proposal.client_company ? ` · ${proposal.client_company}` : ""}</p>
            </div>
            <div className="space-y-8 px-6 py-7 sm:px-9">
              {proposal.project_summary && (
                <section>
                  <h2 className="text-sm font-bold text-slate-900">Project overview</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{proposal.project_summary}</p>
                </section>
              )}

              <section>
                <h2 className="text-sm font-bold text-slate-900">Pricing</h2>
                <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {!!proposal.addons?.length &&
                    (canRespond ||
                      proposal.addons.some((addon) => addon.is_selected || addon.is_required)) && (
                    <div className="flex justify-between gap-4 p-4 text-sm">
                      <span className="text-slate-600">Base price</span><strong className="text-slate-900">{formatIDR(Number(proposal.base_price))}</strong>
                    </div>
                  )}
                  {(proposal.addons ?? [])
                    .filter((addon) => proposal.status !== "APPROVED" || addon.is_selected || addon.is_required)
                    .map((addon) => (
                    <div key={addon.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 p-4 text-sm sm:gap-6">
                      <div className="flex min-w-0 items-start gap-3">
                        {!addon.is_required && canRespond && (
                          <input
                            id={`proposal-addon-${addon.id}`}
                            type="checkbox"
                            aria-label={`Select optional add-on ${addon.title}`}
                            checked={selectedAddonIds.includes(addon.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            onChange={(event) =>
                              setSelectedAddonIds((current) =>
                                event.target.checked
                                  ? [...current, addon.id]
                                  : current.filter((id) => id !== addon.id)
                              )
                            }
                          />
                        )}
                        <label
                          htmlFor={!addon.is_required && canRespond ? `proposal-addon-${addon.id}` : undefined}
                          className={`min-w-0 ${!addon.is_required && canRespond ? "cursor-pointer" : ""}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-700">{addon.title}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${addon.is_required ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                              {addon.is_required ? "Required" : "Optional"}
                            </span>
                          </div>
                          {addon.description && <p className="mt-1.5 text-xs leading-5 text-slate-500">{addon.description}</p>}
                        </label>
                      </div>
                      <strong className="whitespace-nowrap pt-0.5 text-right font-semibold tabular-nums text-slate-900">{formatIDR(Number(addon.price))}</strong>
                    </div>
                    ))}
                  <div className="flex justify-between gap-4 bg-slate-50 p-4 text-sm">
                    <span className="font-bold text-slate-900">Proposal total</span>
                    <strong className="text-slate-900">{formatIDR(canRespond ? currentTotal : Number(proposal.total_amount ?? proposal.base_price))}</strong>
                  </div>
                  <div className="flex justify-between gap-4 p-4 text-sm">
                    <span className="text-slate-600">Down payment ({proposal.dp_percentage}%)</span>
                    <strong className="text-slate-900">{formatIDR(canRespond ? currentTotal * (Number(proposal.dp_percentage) / 100) : Number(proposal.dp_amount ?? 0))}</strong>
                  </div>
                </div>
              </section>

              {!!proposal.milestones?.length && (
                <section>
                  <h2 className="text-sm font-bold text-slate-900">Project milestones</h2>
                  <ol className="mt-3 space-y-3">
                    {proposal.milestones.map((milestone, index) => (
                      <li key={milestone.id} className="flex gap-3 rounded-xl border border-slate-100 p-4">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{index + 1}</span>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">{milestone.title}</h3>
                          {milestone.description && <p className="mt-1 text-sm leading-5 text-slate-600">{milestone.description}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {canRespond ? (
                <>
                  <section aria-labelledby="signature-heading">
                    <h2 id="signature-heading" className="text-sm font-bold text-slate-900">Client e-signature</h2>
                    <p className="mt-1 text-sm text-slate-600">Sign below to confirm you agree with the proposal scope and price.</p>
                    <div className="mt-3">
                      <SignatureCanvas
                        canvasRef={signatureCanvasRef}
                        disabled={responding}
                        onSignatureChange={setHasSignature}
                      />
                    </div>
                    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-5 text-slate-700">
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        disabled={responding}
                        onChange={(event) => setAcceptedTerms(event.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Saya menyetujui rincian scope dan nilai proposal ini.</span>
                    </label>
                  </section>
                  <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-5">
                    <p className="text-sm leading-6 text-slate-700">Review the project details above and submit your decision.</p>
                    <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button type="button" disabled={responding} onClick={() => void respond("REJECTED")} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        <XCircle className="h-4 w-4" /> Decline
                      </button>
                      <button type="button" disabled={responding} onClick={() => void respond("APPROVED")} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                        {responding ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Approve proposal
                      </button>
                    </div>
                  </section>
                </>
              ) : isApproved ? (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="font-bold text-emerald-900">Proposal approved</h2>
                      <p className="mt-1 text-sm leading-5 text-emerald-800">Thank you, {proposal.client_name}. Your down-payment invoice is ready.</p>
                    </div>
                  </div>
                  {proposal.client_signature_path && (
                    <div className="mt-5 rounded-xl border border-emerald-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client e-signature</p>
                      {signatureUrl ? (
                        <img
                          src={signatureUrl}
                          alt="Client's e-signature approving this proposal"
                          className="mx-auto mt-2 h-24 max-w-full object-contain object-center"
                        />
                      ) : signatureError ? (
                        <p role="alert" className="mt-2 text-sm text-rose-700">{signatureError}</p>
                      ) : (
                        <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                          Loading signature…
                        </div>
                      )}
                    </div>
                  )}
                  {proposal.dp_invoice_id ? (
                    <Link
                      to={`/i/${proposal.dp_invoice_id}`}
                      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                    >
                      <Receipt className="h-4 w-4" /> View DP invoice ({formatIDR(Number(proposal.dp_amount))})
                    </Link>
                  ) : (
                    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm text-amber-800">
                        {invoiceError ?? "Preparing the down-payment invoice…"}
                      </p>
                      {creatingInvoice ? (
                        <LoaderCircle className="mt-3 h-4 w-4 animate-spin text-amber-700" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => void ensureInvoice()}
                          className="mt-3 text-sm font-semibold text-amber-900 underline underline-offset-2"
                        >
                          Try again
                        </button>
                      )}
                    </div>
                  )}
                </section>
              ) : (
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                  {proposalStatus === "PAID" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-slate-500" />}
                  Proposal status: {proposalStatus}
                </div>
              )}
            </div>
          </article>
        )}
        <p className="mt-5 text-center text-xs text-slate-400">Questions about this proposal? Contact the agency that shared this link with you.</p>
      </div>
    </main>
  );
}
