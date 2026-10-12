import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button";
import ClientCombobox from "../components/ClientCombobox";
import { useToast } from "../components/Toast";
import { useInvoiceData } from "../context/InvoiceDataContext";
import { createProposal, fetchAgencyProposal, updateProposal } from "../lib/proposal";

interface AddonDraft {
  title: string;
  description: string;
  price: string;
  isRequired: boolean;
}

interface MilestoneDraft {
  title: string;
  description: string;
}

const inputClass = "input";

function formatPriceInput(value: string): string {
  // Keep only digits and a single decimal separator. Indonesian users often
  // type "10.000.000" (dot as thousands separator); treat every dot/comma in
  // the raw input as a grouping separator so it parses as 10000000 instead of
  // silently becoming 10 (PB-D1 data corruption).
  const digitsOnly = value.replace(/[^0-9]/g, "");
  const groupedInteger = digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return groupedInteger;
}

function parsePriceInput(value: string): number {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return Number.NaN;
  return Number(digits);
}

export default function ProposalBuilder() {
  const { user, data, activeCompanyId } = useInvoiceData();
  const { id: proposalId } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [loadingProposal, setLoadingProposal] = useState(Boolean(proposalId));
  const [saving, setSaving] = useState(false);
  const [editUnavailable, setEditUnavailable] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [dpPercentage, setDpPercentage] = useState("50");
  const [paymentBankId, setPaymentBankId] = useState("");
  const [addons, setAddons] = useState<AddonDraft[]>([]);
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([]);
  const agencyWhatsappNumber =
    typeof user?.user_metadata?.agency_whatsapp_number === "string"
      ? user.user_metadata.agency_whatsapp_number
      : "";

  useEffect(() => {
    if (!proposalId) {
      setLoadingProposal(false);
      return;
    }
    if (!user || !activeCompanyId) {
      if (user) {
        setEditUnavailable(true);
        setFormError("Select a workspace before editing this proposal.");
        setLoadingProposal(false);
      }
      return;
    }

    let current = true;
    setEditUnavailable(false);
    setFormError(null);
    setLoadingProposal(true);
    void fetchAgencyProposal(proposalId, user.id, activeCompanyId)
      .then((proposal) => {
        if (!current) return;
        if (!proposal) {
          setEditUnavailable(true);
          setFormError("This proposal was not found in the current workspace.");
          return;
        }
        if (proposal.status === "APPROVED" || proposal.status === "PAID" || proposal.dp_invoice_id) {
          setEditUnavailable(true);
          setFormError("Approved proposals can no longer be edited.");
          return;
        }

        setClientId(proposal.client_id);
        setClientName(proposal.client_name);
        setClientEmail(proposal.client_email);
        setCompany(proposal.client_company ?? "");
        setTitle(proposal.title);
        setSummary(proposal.project_summary ?? "");
        setBasePrice(formatPriceInput(String(proposal.base_price)));
        setDpPercentage(String(proposal.dp_percentage));
        setPaymentBankId(proposal.payment_bank_account_id ?? "");
        setAddons((proposal.addons ?? []).map((addon) => ({
          title: addon.title,
          description: addon.description ?? "",
          price: formatPriceInput(String(addon.price)),
          isRequired: addon.is_required,
        })));
        setMilestones((proposal.milestones ?? []).map((milestone) => ({
          title: milestone.title,
          description: milestone.description ?? "",
        })));
      })
      .catch((error: unknown) => {
        console.error("Failed to load proposal for editing:", error);
        if (current) {
          setEditUnavailable(true);
          setFormError(error instanceof Error ? error.message : "Proposal could not be loaded.");
        }
      })
      .finally(() => {
        if (current) setLoadingProposal(false);
      });

    return () => {
      current = false;
    };
  }, [activeCompanyId, proposalId, user?.id]);

  useEffect(() => {
    if (!proposalId && !paymentBankId && data.bankAccounts.length) {
      setPaymentBankId(data.bankAccounts[0].id);
    }
  }, [data.bankAccounts, paymentBankId, proposalId]);

  const saveProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const price = parsePriceInput(basePrice);
    const dp = Number(dpPercentage);
    if (!user || !activeCompanyId) {
      setFormError("Your session has expired. Sign in again to create a proposal.");
      return;
    }
    if (!clientId || !clientName.trim()) {
      setFormError("Select a client from your Clients list.");
      return;
    }
    if (!title.trim()) {
      setFormError("Project title is required.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setFormError("Base price must be a valid non-negative amount.");
      return;
    }
    if (!Number.isInteger(dp) || dp < 1 || dp > 100) {
      setFormError("DP percentage must be a whole number from 1 to 100.");
      return;
    }
    const trimmedEmail = clientEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      setFormError("Enter a valid client email address.");
      return;
    }
    const paymentBank = data.bankAccounts.find((bank) => bank.id === paymentBankId);
    if (!paymentBank) {
      setFormError("Add a bank account in Settings and select it for this proposal.");
      return;
    }
    if (!agencyWhatsappNumber) {
      setFormError("Set the agency WhatsApp number in Settings before creating a proposal.");
      return;
    }

    const completeAddons = addons.filter((addon) => addon.title.trim());
    const invalidAddon = completeAddons.find(
      (addon) => !Number.isFinite(parsePriceInput(addon.price)) || parsePriceInput(addon.price) < 0
    );
    if (invalidAddon) {
      setFormError(`Enter a valid price for add-on "${invalidAddon.title}".`);
      return;
    }

    setSaving(true);
    try {
      const input = {
        agencyId: user.id,
        workspaceId: activeCompanyId,
        clientId: clientId,
        title: title.trim(),
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim(),
        clientCompany: company.trim(),
        projectSummary: summary.trim(),
        basePrice: price,
        dpPercentage: dp,
        paymentBank,
        agencyWhatsappNumber,
        addons: completeAddons.map((addon) => ({
          title: addon.title.trim(),
          description: addon.description.trim(),
          price: parsePriceInput(addon.price),
          isRequired: addon.isRequired,
        })),
        milestones: milestones
          .filter((milestone) => milestone.title.trim())
          .map((milestone) => ({
            title: milestone.title.trim(),
            description: milestone.description.trim(),
          })),
      };
      if (proposalId) {
        await updateProposal(proposalId, user.id, activeCompanyId, input);
        showToast("Proposal updated.");
      } else {
        const proposal = await createProposal(input);
        showToast("Proposal saved as draft.");
        navigate("/proposals", { replace: true, state: { createdId: proposal.id } });
      }
      if (proposalId) navigate("/proposals", { replace: true });
    } catch (error) {
      console.error("Failed to create proposal:", error);
      setFormError(error instanceof Error ? error.message : "Proposal could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link to="/proposals" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />
        Back to proposals
      </Link>
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{proposalId ? "Edit proposal" : "Create a proposal"}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {proposalId ? "Update the proposal details, pricing, and delivery roadmap." : "Add client details, project pricing, and a delivery roadmap."}
        </p>
      </div>

      {loadingProposal ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500">
          <LoaderCircle className="h-5 w-5 animate-spin" /> Loading proposal…
        </div>
      ) : editUnavailable ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p>{formError}</p>
          <Link to="/proposals" className="mt-2 inline-block font-semibold underline">Back to proposals</Link>
        </div>
      ) : (
      <form onSubmit={saveProposal} className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="font-bold text-slate-900">Client and project</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <span className="label">Client Name</span>
              <ClientCombobox
                id="proposal-client"
                clients={data.clients}
                value={clientId}
                onChange={(id) => {
                  setClientId(id);
                  const client = data.clients.find((item) => item.id === id);
                  setClientName(client?.name ?? "");
                  setClientEmail(client?.email ?? "");
                  setCompany(client?.company ?? "");
                }}
              />
            </div>
            <label>
              <span className="label">Client Email</span>
              <input className={inputClass} type="email" maxLength={100} value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} />
            </label>
            <label>
              <span className="label">Company</span>
              <input className={inputClass} maxLength={100} value={company} onChange={(event) => setCompany(event.target.value)} />
            </label>
            <label>
              <span className="label">Project Title</span>
              <input className={inputClass} required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="sm:col-span-2">
              <span className="label">Project Summary</span>
              <textarea className={`${inputClass} min-h-24 resize-y`} value={summary} onChange={(event) => setSummary(event.target.value)} />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="font-bold text-slate-900">Pricing</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="label">Base Price (IDR)</span>
              <input
                className={inputClass}
                type="text"
                inputMode="decimal"
                required
                value={basePrice}
                onChange={(event) => setBasePrice(formatPriceInput(event.target.value))}
              />
            </label>
            <label>
              <span className="label">DP Percentage (%)</span>
              <input className={inputClass} type="number" min="1" max="100" step="1" required value={dpPercentage} onChange={(event) => setDpPercentage(event.target.value)} />
            </label>
          </div>
          <label className="mt-4 block">
            <span className="label">DP Payment Bank Account</span>
            <select
              className={inputClass}
              required
              value={paymentBankId}
              onChange={(event) => setPaymentBankId(event.target.value)}
              disabled={!data.bankAccounts.length}
            >
              <option value="" disabled>
                {data.bankAccounts.length ? "Choose a bank account…" : "Add a bank account in Settings first"}
              </option>
              {data.bankAccounts.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name} · {bank.accountNumber} · {bank.holder}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Payment details are saved as a snapshot on this proposal.
            </span>
          </label>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">Add-ons</h3>
              <p className="mt-1 text-xs text-slate-500">Required add-ons are included in the proposal total.</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setAddons((rows) => [...rows, { title: "", description: "", price: "", isRequired: false }])}>
              <Plus className="h-4 w-4" /> Add add-on
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {addons.map((addon, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
                <label>
                  <span className="label">Title</span>
                  <input className={inputClass} maxLength={150} value={addon.title} onChange={(event) => setAddons((rows) => rows.map((row, i) => i === index ? { ...row, title: event.target.value } : row))} />
                </label>
                <label>
                  <span className="label">Price (IDR)</span>
                  <input
                    className={inputClass}
                    type="text"
                    inputMode="decimal"
                    value={addon.price}
                    onChange={(event) =>
                      setAddons((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, price: formatPriceInput(event.target.value) } : row
                        )
                      )
                    }
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="label">Description</span>
                  <input className={inputClass} value={addon.description} onChange={(event) => setAddons((rows) => rows.map((row, i) => i === index ? { ...row, description: event.target.value } : row))} />
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={addon.isRequired} onChange={(event) => setAddons((rows) => rows.map((row, i) => i === index ? { ...row, isRequired: event.target.checked } : row))} />
                  Required (included in base proposal total)
                </label>
                <button type="button" onClick={() => setAddons((rows) => rows.filter((_, i) => i !== index))} className="inline-flex items-center gap-1 justify-self-start text-sm font-semibold text-rose-600 hover:text-rose-700">
                  <Trash2 className="h-4 w-4" /> Remove add-on
                </button>
              </div>
            ))}
            {!addons.length && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">No add-ons added.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">Milestones</h3>
              <p className="mt-1 text-xs text-slate-500">Outline the steps in your project roadmap.</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setMilestones((rows) => [...rows, { title: "", description: "" }])}>
              <Plus className="h-4 w-4" /> Add milestone
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {milestones.map((milestone, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
                <label>
                  <span className="label">Milestone title</span>
                  <input className={inputClass} maxLength={150} value={milestone.title} onChange={(event) => setMilestones((rows) => rows.map((row, i) => i === index ? { ...row, title: event.target.value } : row))} />
                </label>
                <label>
                  <span className="label">Description</span>
                  <input className={inputClass} value={milestone.description} onChange={(event) => setMilestones((rows) => rows.map((row, i) => i === index ? { ...row, description: event.target.value } : row))} />
                </label>
                <button type="button" onClick={() => setMilestones((rows) => rows.filter((_, i) => i !== index))} className="inline-flex items-center gap-1 justify-self-start text-sm font-semibold text-rose-600 hover:text-rose-700">
                  <Trash2 className="h-4 w-4" /> Remove milestone
                </button>
              </div>
            ))}
            {!milestones.length && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">No milestones added.</p>}
          </div>
        </section>

        {formError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{formError}</p>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate("/proposals")}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {proposalId ? "Save Changes" : "Save Proposal"}
          </Button>
        </div>
      </form>
      )}
    </div>
  );
}
