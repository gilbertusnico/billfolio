import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Copy,
  Link2,
  LoaderCircle,
  Palette,
  Printer,
  Plus,
  Save,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useInvoiceData } from "../context/InvoiceDataContext";
import { useToast } from "../components/Toast";
import { formatIDR, toISODate } from "../lib/format";
import { buildInvoiceNumber, grandTotal, itemAmount } from "../lib/invoice";
import { buildWhatsAppMessage, whatsAppShareUrl } from "../lib/phone";
import Button from "../components/Button";
import ClientCombobox from "../components/ClientCombobox";
import ClientModal from "../components/ClientModal";
import type { ClientInput } from "../components/ClientModal";
import ConfirmDialog from "../components/ConfirmDialog";
import InvoicePreview from "../components/InvoicePreview";
import Modal from "../components/Modal";
import { Skeleton } from "../components/Skeleton";
import type {
  BankSnapshot,
  ClientSnapshot,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  Client,
  TableStyleCustomization,
  TemplateBorder,
  TemplateCustomization,
} from "../types";

const THICKNESS_OPTIONS = [
  { value: 2, label: "Thin · 2px" },
  { value: 4, label: "Medium · 4px" },
  { value: 8, label: "Thick · 8px" },
] as const;

interface ColorFieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

function normalizeHexColor(value: string, fallback: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return fallback;

  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;

  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(withHash)) {
    return withHash.toUpperCase();
  }

  return fallback;
}

function sanitizeHexDraft(next: string): string {
  const raw = next.trim();
  if (!raw) return "";
  const cleaned = raw.replace(/[^#0-9a-fA-F]/g, "");
  const withoutHash = cleaned.startsWith("#") ? cleaned.slice(1) : cleaned;
  const limited = withoutHash.slice(0, 6);
  return `#${limited}`.toUpperCase();
}

function ColorField({ label, hint, value, onChange, disabled = false }: ColorFieldProps) {
  const [textValue, setTextValue] = useState(() => normalizeHexColor(value, "#2563EB"));

  useEffect(() => {
    setTextValue(normalizeHexColor(value, "#2563EB"));
  }, [value]);

  const handleTextChange = (next: string) => {
    const sanitized = sanitizeHexDraft(next);
    setTextValue(sanitized);

    if (/^#[0-9a-fA-F]{3}$/.test(sanitized) || /^#[0-9a-fA-F]{6}$/.test(sanitized)) {
      onChange(sanitized);
    }
  };

  return (
    <div>
      <span className="label">{label}</span>
      <div
        className={`focus-within:ring-blue-500/20 flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 transition-colors duration-200 focus-within:border-blue-500 focus-within:ring-2 ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <input
          type="color"
          value={normalizeHexColor(value, "#2563EB")}
          disabled={disabled}
          onChange={(e) => onChange(normalizeHexColor(e.target.value, value))}
          aria-label={label}
          className={`h-7 w-9 shrink-0 appearance-none rounded border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        />
        <input
          type="text"
          value={textValue}
          disabled={disabled}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={() => setTextValue(normalizeHexColor(textValue, value))}
          aria-label={`${label} hex value`}
          placeholder="#F4731A"
          inputMode="text"
          spellCheck={false}
          className="min-w-0 flex-1 border-0 bg-transparent px-0 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 outline-none placeholder:text-slate-300 disabled:cursor-not-allowed"
        />
      </div>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

interface BorderRowProps {
  label: string;
  border: TemplateBorder;
  onChange: (patch: Partial<TemplateBorder>) => void;
}

/** Toggle + color + thickness for one decorative border bar. */
function BorderRow({ label, border, onChange }: BorderRowProps) {
  const [textValue, setTextValue] = useState(() => normalizeHexColor(border.color, "#2563EB"));

  useEffect(() => {
    setTextValue(normalizeHexColor(border.color, "#2563EB"));
  }, [border.color]);

  const handleTextChange = (next: string) => {
    const sanitized = sanitizeHexDraft(next);
    setTextValue(sanitized);

    if (/^#[0-9a-fA-F]{3}$/.test(sanitized) || /^#[0-9a-fA-F]{6}$/.test(sanitized)) {
      onChange({ color: sanitized });
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3 sm:w-[220px]">
          <button
            type="button"
            role="switch"
            aria-checked={border.visible}
            aria-label={`Show ${label}`}
            onClick={() => onChange({ visible: !border.visible })}
            className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
              border.visible ? "bg-blue-600" : "bg-slate-300"
            }`}
          >
            <span
              aria-hidden
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                border.visible ? "translate-x-5" : ""
              }`}
            />
          </button>
          <span className="min-w-0 text-sm font-semibold text-slate-700">{label}</span>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:justify-end">
          <input
            type="color"
            value={normalizeHexColor(border.color, "#2563EB")}
            disabled={!border.visible}
            onChange={(e) => onChange({ color: normalizeHexColor(e.target.value, border.color) })}
            aria-label={`${label} color`}
            className={`h-7 w-9 shrink-0 cursor-pointer appearance-none rounded-lg border-0 bg-white p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
              border.visible ? "" : "cursor-not-allowed opacity-40"
            }`}
          />
          <input
            type="text"
            value={textValue}
            disabled={!border.visible}
            onChange={(e) => handleTextChange(e.target.value)}
            onBlur={() => setTextValue(normalizeHexColor(textValue, border.color))}
            aria-label={`${label} hex color`}
            placeholder="#F4731A"
            inputMode="text"
            spellCheck={false}
            className={`min-w-0 flex-1 rounded-lg border-0 bg-white px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 outline-none transition-colors duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
              border.visible ? "" : "cursor-not-allowed opacity-40"
            }`}
          />
          <select
            value={border.thickness}
            disabled={!border.visible}
            onChange={(e) => onChange({ thickness: Number(e.target.value) as TemplateBorder["thickness"] })}
            aria-label={`${label} thickness`}
            className={`min-w-[120px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 transition-colors duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
              border.visible ? "" : "cursor-not-allowed opacity-40"
            }`}
          >
            {THICKNESS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

const newItem = (): InvoiceItem => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: 1,
  unitPrice: 0,
});

/**
 * Parse a numeric field while stripping leading zeros as the user types
 * ("015000" → 15000, "05" → 5). Empty input resolves to 0.
 */
function parseNumericInput(raw: string): number {
  if (raw.trim() === "") return 0;
  const cleaned = raw.replace(/^0+(?=\d)/, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function normalizeClientLookup(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function defaultDates() {
  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() + 14);
  return { invoiceDate: toISODate(today), dueDate: toISODate(due) };
}

export default function InvoiceBuilder() {
  const { id } = useParams();
  const isNew = !id;
  const { data, isLoading, upsertInvoice, updateSettings, updateTemplate, upsertClient } =
    useInvoiceData();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [ready, setReady] = useState(false);
  const [number, setNumber] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientDraft, setClientDraft] = useState<Client | null>(null);
  const [projectName, setProjectName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => defaultDates().invoiceDate);
  const [dueDate, setDueDate] = useState(() => defaultDates().dueDate);
  const [items, setItems] = useState<InvoiceItem[]>([newItem()]);
  const [taxRate, setTaxRate] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("PENDING");
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [paidConfirmOpen, setPaidConfirmOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quickPromptOpen, setQuickPromptOpen] = useState(false);
  const [quickPrompt, setQuickPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // Public share-link state — populated by "Generate & Share Link".
  const shareRef = useRef<HTMLDivElement | null>(null);
  const [shareInfo, setShareInfo] = useState<{ invoice: Invoice; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Hydrate form state once the data is ready (edit mode prefills).
  useEffect(() => {
    if (isLoading) return;
    if (id) {
      const inv = data.invoices.find((i) => i.id === id);
      if (!inv) {
        navigate("/invoices", { replace: true });
        return;
      }
      setNumber(inv.number);
      setClientId(inv.clientId);
      setProjectName(inv.projectName);
      setInvoiceDate(inv.invoiceDate);
      setDueDate(inv.dueDate);
      setItems(inv.items.length ? inv.items.map((i) => ({ ...i })) : [newItem()]);
      setTaxRate(inv.taxRate);
      setDiscount(inv.discount);
      setBankAccountId(inv.bankAccountId);
      setNotes(inv.notes);
      setStatus(inv.status);
    }
    setReady(true);
  }, [data.invoices, id, isLoading, navigate]);

  const nextNumber = buildInvoiceNumber(
    data.settings.invoicePrefix,
    data.profile.companyName,
    data.settings.lastSequence + 1
  );
  const displayNumber = isNew ? nextNumber : number || nextNumber;

  const clientSnap = useMemo<ClientSnapshot | null>(() => {
    const c = data.clients.find((x) => x.id === clientId);
    return c
      ? { name: c.name, company: c.company, email: c.email, phone: c.phone, address: c.address }
      : null;
  }, [data.clients, clientId]);

  const bankSnap = useMemo<BankSnapshot | null>(() => {
    const b = data.bankAccounts.find((x) => x.id === bankAccountId);
    return b ? { name: b.name, accountNumber: b.accountNumber, holder: b.holder } : null;
  }, [data.bankAccounts, bankAccountId]);

  const subtotal = items.reduce((sum, it) => sum + itemAmount(it), 0);
  const hasTax = (Number(taxRate) || 0) > 0;
  const hasDiscount = (Number(discount) || 0) > 0;
  const tax = (subtotal * (Number(taxRate) || 0)) / 100;
  const discountAmount = Number(discount) || 0;
  const total = Math.max(0, subtotal - discountAmount + tax);

  // Share panel values — WhatsApp deep link uses the client's CURRENT phone
  // (not the invoice snapshot) so legacy clients without a phone can be fixed.
  const shareClient = shareInfo
    ? (data.clients.find((c) => c.id === shareInfo.invoice.clientId) ?? null)
    : null;
  const sharePhone = shareClient?.phone?.trim() ?? "";
  const canShareWhatsApp = Boolean(shareInfo && sharePhone);
  const whatsAppHref =
    shareInfo && sharePhone
      ? whatsAppShareUrl(
          sharePhone,
          buildWhatsAppMessage({
            clientName: shareInfo.invoice.clientSnapshot?.name ?? "Customer",
            invoiceNumber: shareInfo.invoice.number,
            grandTotal: formatIDR(grandTotal(shareInfo.invoice)),
            link: shareInfo.link,
          })
        )
      : null;

  // Template customization → persisted to LocalStorage via the shared context.
  const patchTemplate = (patch: Partial<TemplateCustomization>) =>
    updateTemplate({ ...data.template, ...patch });

  const patchBorder = (which: "topBorder" | "bottomBorder", patch: Partial<TemplateBorder>) =>
    updateTemplate({ ...data.template, [which]: { ...data.template[which], ...patch } });

  const patchTable = (patch: Partial<TableStyleCustomization>) =>
    updateTemplate({ ...data.template, table: { ...data.template.table, ...patch } });

  const updateItem = (itemId: string, patch: Partial<InvoiceItem>) =>
    setItems((list) => list.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));

  const removeItem = (itemId: string) =>
    setItems((list) => (list.length > 1 ? list.filter((it) => it.id !== itemId) : [newItem()]));

  const buildInvoice = (): Invoice | null => {
    if (!clientId) {
      setFormError("Select a client before saving the invoice.");
      return null;
    }
    const validItems = items.filter((it) => Number(it.quantity) > 0);
    if (validItems.length === 0) {
      setFormError("Add at least one line item with a quantity greater than 0.");
      return null;
    }
    if (status === "PENDING" && !bankAccountId) {
      setFormError(
        "Pick a bank account — Pending invoices need one so your client knows where to pay."
      );
      return null;
    }
    if (status === "PENDING" && validItems.some((it) => it.description.trim() === "")) {
      setFormError(
        "Fill in a description for every line item — Pending invoices can't have empty descriptions."
      );
      return null;
    }
    setFormError(null);
    const existing = id ? data.invoices.find((i) => i.id === id) : undefined;
    const client = data.clients.find((c) => c.id === clientId) ?? null;
    const bank = data.bankAccounts.find((b) => b.id === bankAccountId) ?? null;
    const nowIso = new Date().toISOString();
    const paidAt = status === "PAID" ? (existing?.paidAt ?? nowIso) : null;
    return {
      id: id ?? crypto.randomUUID(),
      number: displayNumber,
      clientId,
      clientSnapshot: client
        ? { name: client.name, company: client.company, email: client.email, phone: client.phone, address: client.address }
        : null,
      projectName: projectName.trim(),
      invoiceDate,
      dueDate,
      items: validItems.map((it) => ({ ...it, description: it.description.trim() })),
      taxRate: Number(taxRate) || 0,
      discount: Number(discount) || 0,
      bankAccountId,
      bankSnapshot: bank
        ? { name: bank.name, accountNumber: bank.accountNumber, holder: bank.holder }
        : null,
      notes: notes.trim(),
      status,
      paidAt,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };
  };

  /**
   * Persist the invoice and return the SAME instance that was written (or null
   * when validation fails / the write fails). Callers must use this returned
   * object — never call buildInvoice() again — because a fresh build generates
   * a brand-new random UUID for new invoices, producing a share link that
   * points to an invoice that was never saved.
   */
  const persist = async (): Promise<Invoice | null> => {
    const invoice = buildInvoice();
    if (!invoice) return null;
    const saved = await upsertInvoice(invoice);
    if (!saved) return null;
    // Only a brand-new invoice consumes a sequence number.
    if (isNew) updateSettings({ ...data.settings, lastSequence: data.settings.lastSequence + 1 });
    return invoice;
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const invoice = await persist();
      if (!invoice) return;
      showToast("Invoice Saved");
      navigate("/invoices");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndLink = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const invoice = await persist();
      if (!invoice) return;
      const link = `${window.location.origin}/i/${invoice.id}`;
      setShareInfo({ invoice, link });
      showToast("Invoice saved — share link ready");
      // Bring the share panel into view (the action bar sits at the bottom).
      window.setTimeout(
        () => shareRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
        60
      );
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    if (!shareInfo) return;
    try {
      await navigator.clipboard.writeText(shareInfo.link);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = shareInfo.link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    showToast("Invoice link copied");
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleClientSave = async (input: ClientInput) => {
    const nowIso = new Date().toISOString();
    const client = { id: crypto.randomUUID(), ...input, createdAt: nowIso, updatedAt: nowIso };
    const saved = await upsertClient(client);
    if (!saved) return;
    setClientId(client.id);
    setClientDraft(null);
    setClientModalOpen(false);
    showToast("Client Added");
  };

  const handleGenerateInvoice = async () => {
    const prompt = quickPrompt.trim();
    if (!prompt) {
      showToast("Tulis detail invoice terlebih dahulu", "error");
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch("/api/ai/parse-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const responseText = await response.text();
      let result: {
        error?: string;
        client_name?: string;
        project_name?: string;
        due_days?: number;
        tax_rate?: number;
        discount?: number;
        items?: Array<{ description?: string; quantity?: number; unit_price?: number }>;
      } = {};

      if (responseText.trim()) {
        try {
          result = JSON.parse(responseText) as typeof result;
        } catch {
          throw new Error(
            "Server AI mengembalikan response yang tidak valid. Jalankan aplikasi melalui Vercel atau `vercel dev`, bukan Vite saja."
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          result.error ||
            `AI endpoint tidak tersedia (HTTP ${response.status}). Jalankan aplikasi melalui Vercel atau \`vercel dev\`.`
        );
      }

      const parsedItems = (result.items ?? [])
        .filter((item) => item.description?.trim())
        .map((item) => ({
          id: crypto.randomUUID(),
          description: item.description?.trim() ?? "",
          quantity: Number.isFinite(item.quantity) && Number(item.quantity) > 0 ? Number(item.quantity) : 1,
          unitPrice: Number.isFinite(item.unit_price) ? Math.max(0, Number(item.unit_price)) : 0,
        }));

      if (parsedItems.length === 0) {
        throw new Error("AI tidak menemukan item invoice. Tambahkan nama item dan harganya.");
      }

      const clientName = result.client_name?.trim() ?? "";
      const normalizedClientName = normalizeClientLookup(clientName);
      const matchedClient = data.clients.find((client) =>
        [client.name, client.company].some(
          (value) => normalizeClientLookup(value) === normalizedClientName
        )
      );
      setClientId(matchedClient?.id ?? null);
      setProjectName(result.project_name?.trim() ?? "");
      setTaxRate(Math.max(0, Number(result.tax_rate) || 0));
      setDiscount(Math.max(0, Number(result.discount) || 0));
      setItems(parsedItems);

      const dueDays = Math.max(0, Number(result.due_days) || 7);
      const due = new Date(`${invoiceDate}T00:00:00`);
      due.setDate(due.getDate() + dueDays);
      setDueDate(toISODate(due));
      setQuickPromptOpen(false);
      if (!matchedClient && normalizedClientName) {
        const nowIso = new Date().toISOString();
        setClientDraft({
          id: crypto.randomUUID(),
          name: result.client_name?.trim() ?? "",
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        setClientModalOpen(true);
      }
      showToast(
        matchedClient || !clientName
          ? "Invoice berhasil dibuat dari prompt AI"
          : `Invoice dibuat, tapi client “${result.client_name}” belum ada di daftar`
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "AI gagal memproses invoice.", "error");
    } finally {
      setGenerating(false);
    }
  };

  if (!ready) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Skeleton className="h-[560px] w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ---------------- Form column ---------------- */}
      <form
        onSubmit={(e) => e.preventDefault()}
        className="min-w-0 space-y-5"
        aria-label="Invoice form"
      >
        <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-bold text-slate-900">Invoice Quick Prompt</h2>
                <p className="mt-0.5 text-sm text-slate-600">
                  Tulis detail invoice bebas, lalu biarkan AI mengisi form.
                </p>
              </div>
            </div>
            <Button type="button" onClick={() => setQuickPromptOpen(true)}>
              <Sparkles className="h-4 w-4" />
              Generate Invoice
            </Button>
          </div>
        </section>

        {formError && (
          <div
            role="alert"
            className="animate-fade-in flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {formError}
          </div>
        )}

        {/* Details */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">
            Invoice Details
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="label">Invoice Number</span>
              <input
                readOnly
                value={displayNumber}
                onFocus={(e) => e.target.select()}
                className="input bg-slate-50 font-bold text-slate-700"
                aria-label="Invoice number (auto)"
              />
            </div>
            <div>
              <label htmlFor="ib-project" className="label">
                Project Name
              </label>
              <input
                id="ib-project"
                className="input"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Website redesign — Q3"
              />
            </div>
            <div>
              <label htmlFor="ib-date" className="label">
                Invoice Date
              </label>
              <input
                id="ib-date"
                type="date"
                className="input"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="ib-due" className="label">
                Due Date
              </label>
              <input
                id="ib-due"
                type="date"
                className="input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => {
                      const due = new Date();
                      due.setDate(due.getDate() + days);
                      setDueDate(toISODate(due));
                    }}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-[0.97]"
                  >
                    +{days} Days
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <span className="label">Client</span>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                <div className="min-w-0 flex-1">
                  <ClientCombobox
                    id="invoice-client"
                    clients={data.clients}
                    value={clientId}
                    onChange={setClientId}
                  />
                </div>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setClientDraft(null);
                    setClientModalOpen(true);
                  }}
                  className="shrink-0 sm:shrink"
                >
                  <UserPlus className="h-4 w-4" />
                  Add New Client
                </Button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ib-status" className="label">
                Status
              </label>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
                <select
                  id="ib-status"
                  className="input sm:max-w-[180px]"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PENDING">Pending</option>
                  <option value="PAID">Paid</option>
                </select>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={status === "PAID"}
                  onClick={() => setPaidConfirmOpen(true)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark as Paid
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Line items */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">
            Line Items
          </h2>
          {/* Column header — hidden on phones, the mobile layout shows per-field labels */}
          <div className="hidden items-center gap-2 px-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:grid sm:grid-cols-[minmax(0,1fr)_76px_minmax(96px,1fr)_minmax(100px,1fr)_32px]">
            <span>Description</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Unit Price</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <div className="space-y-2.5 sm:space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="animate-slide-up rounded-xl border border-slate-200 p-3 sm:grid sm:grid-cols-[minmax(0,1fr)_76px_minmax(96px,1fr)_minmax(100px,1fr)_32px] sm:items-center sm:gap-2 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0"
              >
                {/* Mobile / narrow: stacked card */}
                <div className="space-y-2.5 sm:hidden">
                  <input
                    className="input py-2"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, { description: e.target.value })}
                    placeholder="Describe the work or product"
                    aria-label="Item description"
                  />
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Qty
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        className="input py-2 text-center"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item.id, { quantity: parseNumericInput(e.target.value) })
                        }
                        aria-label="Quantity"
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Unit price
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        className="input py-2 text-right"
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateItem(item.id, { unitPrice: parseNumericInput(e.target.value) })
                        }
                        aria-label="Unit price"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Amount
                    </span>
                    <span className="mr-auto text-sm font-semibold text-slate-800">
                      {formatIDR(itemAmount(item))}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove item ${item.description || item.id}`}
                      className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors duration-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-500 active:scale-[0.9]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Desktop / tablet: single-row grid, labels in the header row above */}
                <div className="hidden sm:contents">
                  <input
                    className="input py-2"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, { description: e.target.value })}
                    placeholder="Describe the work or product"
                    aria-label="Item description"
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="input py-2 text-center"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(item.id, { quantity: parseNumericInput(e.target.value) })
                    }
                    aria-label="Quantity"
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="input py-2 text-right"
                    value={item.unitPrice}
                    onChange={(e) =>
                      updateItem(item.id, { unitPrice: parseNumericInput(e.target.value) })
                    }
                    aria-label="Unit price"
                  />
                  <span className="text-right text-sm font-semibold text-slate-800">
                    {formatIDR(itemAmount(item))}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove item ${item.description || item.id}`}
                    className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors duration-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-500 active:scale-[0.9]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="secondary"
            type="button"
            className="mt-4"
            onClick={() => setItems((list) => [...list, newItem()])}
          >
            <Plus className="h-4 w-4" />
            Add Item
          </Button>
          <p className="mt-2 text-xs text-slate-400">
            Rows with a quantity of 0 are ignored — at least one row with a quantity &gt; 0 is
            required to save.
          </p>
        </section>

        {/* Financials */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">
            Tax &amp; Totals
          </h2>
          <div className="ml-auto max-w-xs space-y-2.5">
            {(hasTax || hasDiscount) && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-semibold text-slate-800">{formatIDR(subtotal)}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 text-sm">
              <label htmlFor="ib-tax" className="text-slate-500">
                Tax rate (%)
              </label>
              <input
                id="ib-tax"
                type="number"
                min="0"
                max="100"
                step="0.5"
                className="input w-24 text-right"
                value={taxRate}
                onChange={(e) => setTaxRate(parseNumericInput(e.target.value))}
              />
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <label htmlFor="ib-discount" className="text-slate-500">
                Discount (Rp)
              </label>
              <input
                id="ib-discount"
                type="number"
                min="0"
                step="1000"
                className="input w-32 text-right"
                value={discount}
                onChange={(e) => setDiscount(parseNumericInput(e.target.value))}
              />
            </div>
            {hasTax && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Tax</span>
                <span className="font-semibold text-slate-800">{formatIDR(tax)}</span>
              </div>
            )}
            <div
              className={`flex items-center justify-between pt-3 ${
                hasTax || hasDiscount ? "border-t border-slate-200" : ""
              }`}
            >
              <span className="text-sm font-bold text-slate-900">Grand Total</span>
              <span className="text-xl font-extrabold tracking-tight text-slate-900">
                {formatIDR(total)}
              </span>
            </div>
          </div>
        </section>

        {/* Payment + notes */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">
            Payment &amp; Notes
          </h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="ib-bank" className="label">
                Bank Account
              </label>
              {data.bankAccounts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                  No bank accounts yet —{" "}
                  <Link
                    to="/settings"
                    className="font-semibold text-blue-600 transition-colors duration-200 hover:text-blue-700"
                  >
                    add one in Settings
                  </Link>{" "}
                  to appear on your invoices.
                </div>
              ) : (
                <select
                  id="ib-bank"
                  className="input"
                  value={bankAccountId ?? ""}
                  onChange={(e) => setBankAccountId(e.target.value || null)}
                >
                  <option value="">No bank account</option>
                  {data.bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.holder}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label htmlFor="ib-notes" className="label">
                Notes
              </label>
              <textarea
                id="ib-notes"
                className="input min-h-[88px] resize-y"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment terms, thank-you note, etc."
              />
            </div>
          </div>
        </section>

        {/* Template customization — collapsible so the core form stays compact */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setTemplateOpen((o) => !o)}
            aria-expanded={templateOpen}
            aria-controls="ib-template-panel"
            className="flex w-full cursor-pointer items-center gap-3 p-5 text-left transition-colors duration-200 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Palette className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold uppercase tracking-widest text-slate-500">
                Template Customization
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Style the document — every change applies to the Live Preview and to print in
                real time.
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${
                templateOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          <div
            id="ib-template-panel"
            className={`grid transition-all duration-300 ease-in-out ${
              templateOpen
                ? "visible grid-rows-[1fr] opacity-100"
                : "invisible grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="space-y-5 border-t border-slate-100 px-5 pb-5 pt-4">
                {/* Accent colors */}
                <div>
                  <h3 className="label">Text Colors</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ColorField
                      label="“INVOICE” title text color"
                      hint="Defaults to the primary accent"
                      value={data.template.invoiceTitleColor}
                      onChange={(color) => patchTemplate({ invoiceTitleColor: color })}
                    />
                    <ColorField
                      label="Company name text color"
                      hint="Header and “From” section"
                      value={data.template.companyNameColor}
                      onChange={(color) => patchTemplate({ companyNameColor: color })}
                    />
                  </div>

                  <div className="mt-4">
                    <label htmlFor="ib-thankyou-message" className="label">
                      Closing line
                    </label>
                    <textarea
                      id="ib-thankyou-message"
                      className="input min-h-[88px] resize-y"
                      value={data.template.thankYouMessage}
                      onChange={(e) => patchTemplate({ thankYouMessage: e.target.value })}
                      placeholder="Terima kasih atas kerja sama Anda."
                    />
                    <p className="mt-2 text-[11px] text-slate-400">
                      This text is saved per company in Template Customization, so each workspace can use a different closing line.
                    </p>
                  </div>
                </div>

                {/* Decorative borders */}
                <div className="border-t border-slate-200 pt-5">
                  <h3 className="label">Decorative Top &amp; Bottom Borders</h3>
                  <div className="space-y-2.5">
                    <BorderRow
                      label="Top Border Bar"
                      border={data.template.topBorder}
                      onChange={(patch) => patchBorder("topBorder", patch)}
                    />
                    <BorderRow
                      label="Bottom Border Bar"
                      border={data.template.bottomBorder}
                      onChange={(patch) => patchBorder("bottomBorder", patch)}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Bars render at the very top and bottom edge of the document — on screen and
                    when printing via the browser.
                  </p>
                </div>

                {/* Line items table style */}
                <div className="border-t border-slate-200 pt-5">
                  <h3 className="label">Line Items Table Style</h3>
                  <div className="space-y-2.5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="ib-table-style" className="label">
                          Header fill style
                        </label>
                        <select
                          id="ib-table-style"
                          className="input"
                          value={data.template.table.headerStyle}
                          onChange={(e) =>
                            patchTable({
                              headerStyle: e.target.value as TableStyleCustomization["headerStyle"],
                            })
                          }
                        >
                          <option value="filled">Filled Background — soft tint</option>
                          <option value="minimal">Minimal Line — borders only</option>
                        </select>
                      </div>
                      <ColorField
                        label="Table header background color"
                        hint="Visible when “Filled Background” is selected"
                        value={data.template.table.headerColor}
                        onChange={(color) => patchTable({ headerColor: color })}
                        disabled={data.template.table.headerStyle === "minimal"}
                      />
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={data.template.table.zebra}
                          onChange={(e) => patchTable({ zebra: e.target.checked })}
                          aria-label="Zebra striping on line item rows"
                          className="h-4 w-4 shrink-0 cursor-pointer rounded accent-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                        />
                        <span className="text-sm font-semibold text-slate-700">
                          Zebra Striping
                        </span>
                        <span className="ml-auto text-[11px] text-slate-400">
                          Alternating light row backgrounds
                        </span>
                      </label>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Applies to the line-item table on screen and in print.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pinned actions */}
        <div className="sticky bottom-0 z-20 flex flex-col-reverse gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:justify-end">
          <Button variant="secondary" type="button" onClick={() => void handleSave()} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save"}
          </Button>
          {status !== "DRAFT" && (
            <>
              <Button
                variant="secondary"
                type="button"
                onClick={() => window.print()}
                disabled={saving}
              >
                <Printer className="h-4 w-4" />
                Print / PDF
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={() => void handleSaveAndLink()}
                disabled={saving}
              >
                {saving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {saving ? "Saving…" : "Generate \u0026 Share Link"}
              </Button>
            </>
          )}
        </div>

        {/* Share-link panel — appears right after "Generate & Share Link" */}
        {shareInfo && (
          <div
            ref={shareRef}
            className="animate-fade-in rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <h2 className="text-sm font-extrabold uppercase tracking-widest text-emerald-700">
                Invoice saved — share it
              </h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Your client can view, print, and mark{" "}
              <span className="font-semibold">{shareInfo.invoice.number}</span> as paid through this
              link.
            </p>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
                <Link2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate" title={shareInfo.link}>
                  {shareInfo.link}
                </span>
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  aria-label="Copy invoice link"
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 active:scale-[0.95]"
                >
                  {copied ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <a
                href={whatsAppHref ?? undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!canShareWhatsApp}
                className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-300 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 active:scale-[0.97] ${
                  canShareWhatsApp
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 hover:shadow-md"
                    : "pointer-events-none bg-slate-200 text-slate-400"
                }`}
              >
                <SiWhatsapp className="h-4 w-4" aria-hidden />
                Share to WhatsApp
              </a>
            </div>

            {!canShareWhatsApp && (
              <p className="mt-2 text-[11px] font-medium text-amber-700">
                Add a phone number to this client (Clients → edit) to enable the WhatsApp button —
                the link above still works.
              </p>
            )}
          </div>
        )}
      </form>

      {/* ---------------- Live preview column ---------------- */}
      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="preview-pulse absolute inline-flex h-full w-full rounded-full bg-blue-500" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
          </span>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Live Preview
          </p>
          <p className="ml-auto text-[11px] font-medium text-slate-400">A4 · prints via browser</p>
        </div>
        <div className="builder-preview relative overflow-hidden rounded-2xl bg-slate-100 p-3 ring-1 ring-slate-200 sm:p-5">
          <div className="preview-scanlines pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative z-10">
            <InvoicePreview
              number={displayNumber}
              invoiceDate={invoiceDate}
              dueDate={dueDate}
              projectName={projectName}
              client={clientSnap}
              items={items}
              taxRate={taxRate}
              discount={discount}
              bank={bankSnap}
              notes={notes}
              profile={data.profile}
              template={data.template}
            />
          </div>
        </div>
      </div>

      <Modal
        open={quickPromptOpen}
        title="Invoice Quick Prompt"
        onClose={() => {
          if (!generating) setQuickPromptOpen(false);
        }}
        maxWidth="max-w-xl"
        dismissible={!generating}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setQuickPromptOpen(false)}
              disabled={generating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleGenerateInvoice()}
              disabled={generating || !quickPrompt.trim()}
            >
              <Sparkles className="h-4 w-4" />
              {generating ? "Generating…" : "Generate Invoice"}
            </Button>
          </>
        }
      >
        <label htmlFor="invoice-quick-prompt" className="label">
          Describe your invoice
        </label>
        <textarea
          id="invoice-quick-prompt"
          value={quickPrompt}
          onChange={(event) => setQuickPrompt(event.target.value)}
          placeholder="Bikin invoice ke PT Maju Bersama buat Website Redesign 15jt dan Maintenance 3jt, diskon 500rb, jatuh tempo 14 hari"
          rows={6}
          maxLength={10_000}
          disabled={generating}
          className="input min-h-36 resize-y"
        />
        <p className="mt-2 text-xs text-slate-500">
          AI akan mengisi client yang sudah terdaftar, project, due date, tax, discount, dan line items.
        </p>
      </Modal>

      <ClientModal
        open={clientModalOpen}
        client={clientDraft}
        mode="create"
        onClose={() => {
          setClientModalOpen(false);
          setClientDraft(null);
        }}
        onSave={handleClientSave}
      />
      <ConfirmDialog
        open={paidConfirmOpen}
        title="Double-confirm payment status"
        message="Are you sure you want to mark this invoice as PAID? This will update the invoice status for your team."
        confirmLabel="Yes, mark as PAID"
        confirmVariant="primary"
        onConfirm={() => {
          setStatus("PAID");
          setPaidConfirmOpen(false);
        }}
        onCancel={() => setPaidConfirmOpen(false)}
      />
    </div>
  );
}
