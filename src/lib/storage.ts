import type {
  BankAccount,
  Client,
  Invoice,
  InvoiceAppData,
  Profile,
  Settings,
  TemplateCustomization,
} from "../types";

export const STORAGE_KEY = "invoice_app_data";

/* Primary accent (blue-600) — used as the default template accent. */
export const ACCENT_COLOR = "#2563eb";

export const DEFAULT_TEMPLATE: TemplateCustomization = {
  invoiceTitleColor: ACCENT_COLOR,
  companyNameColor: "#0f172a",
  topBorder: { visible: false, color: ACCENT_COLOR, thickness: 4 },
  bottomBorder: { visible: false, color: ACCENT_COLOR, thickness: 4 },
  table: { headerStyle: "filled", headerColor: "#eff6ff", zebra: false },
};

export const DEFAULT_DATA: InvoiceAppData = {
  profile: { companyName: "", email: "", address: "", logoUrl: "" },
  bankAccounts: [],
  clients: [],
  invoices: [],
  settings: { lastSequence: 0, invoicePrefix: "INV-", defaultTaxRate: 0 },
  template: DEFAULT_TEMPLATE,
};

export function readInvoiceAppData(): InvoiceAppData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InvoiceAppData;
    return sanitize(parsed);
  } catch {
    return null;
  }
}

export function saveInvoiceAppData(data: InvoiceAppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Returns existing data, or seeds the default shape on first load. */
export function initInvoiceData(): InvoiceAppData {
  const existing = readInvoiceAppData();
  if (existing) return existing;
  saveInvoiceAppData(DEFAULT_DATA);
  return structuredClone(DEFAULT_DATA);
}

/** Guard against malformed/partial imports by merging with defaults. */
export function sanitize(raw: unknown): InvoiceAppData {
  const base = structuredClone(DEFAULT_DATA);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<InvoiceAppData>;
  const thickness = (t: unknown) => ([2, 4, 8].includes(Number(t)) ? Number(t) as 2 | 4 | 8 : 4);
  return {
    profile: { ...base.profile, ...(r.profile ?? {}) },
    bankAccounts: Array.isArray(r.bankAccounts) ? r.bankAccounts : [],
    clients: Array.isArray(r.clients) ? r.clients : [],
    invoices: Array.isArray(r.invoices) ? r.invoices : [],
    settings: {
      ...base.settings,
      ...(r.settings ?? {}),
      lastSequence: Number(r.settings?.lastSequence ?? 0),
      defaultTaxRate: Number(r.settings?.defaultTaxRate ?? 0),
    },
    template: {
      invoiceTitleColor:
        typeof r.template?.invoiceTitleColor === "string"
          ? r.template.invoiceTitleColor
          : base.template.invoiceTitleColor,
      companyNameColor:
        typeof r.template?.companyNameColor === "string"
          ? r.template.companyNameColor
          : base.template.companyNameColor,
      topBorder: {
        ...base.template.topBorder,
        ...(r.template?.topBorder ?? {}),
        color:
          typeof r.template?.topBorder?.color === "string"
            ? r.template.topBorder.color
            : base.template.topBorder.color,
        thickness: thickness(r.template?.topBorder?.thickness),
      },
      bottomBorder: {
        ...base.template.bottomBorder,
        ...(r.template?.bottomBorder ?? {}),
        color:
          typeof r.template?.bottomBorder?.color === "string"
            ? r.template.bottomBorder.color
            : base.template.bottomBorder.color,
        thickness: thickness(r.template?.bottomBorder?.thickness),
      },
      table: {
        headerStyle:
          r.template?.table?.headerStyle === "minimal" ? "minimal" : "filled",
        headerColor:
          typeof r.template?.table?.headerColor === "string"
            ? r.template.table.headerColor
            : base.template.table.headerColor,
        zebra:
          typeof r.template?.table?.zebra === "boolean"
            ? r.template.table.zebra
            : base.template.table.zebra,
      },
    },
  };
}

/* ---------------- CRUD helpers (pure — return new state) ---------------- */

export function upsertClient(data: InvoiceAppData, client: Client): InvoiceAppData {
  const exists = data.clients.some((c) => c.id === client.id);
  return {
    ...data,
    clients: exists
      ? data.clients.map((c) => (c.id === client.id ? client : c))
      : [...data.clients, client],
  };
}

export function deleteClient(data: InvoiceAppData, id: string): InvoiceAppData {
  return { ...data, clients: data.clients.filter((c) => c.id !== id) };
}

export function upsertInvoice(data: InvoiceAppData, invoice: Invoice): InvoiceAppData {
  const exists = data.invoices.some((i) => i.id === invoice.id);
  return {
    ...data,
    invoices: exists
      ? data.invoices.map((i) => (i.id === invoice.id ? invoice : i))
      : [...data.invoices, invoice],
  };
}

export function deleteInvoice(data: InvoiceAppData, id: string): InvoiceAppData {
  return { ...data, invoices: data.invoices.filter((i) => i.id !== id) };
}

export function upsertBankAccount(data: InvoiceAppData, account: BankAccount): InvoiceAppData {
  const exists = data.bankAccounts.some((a) => a.id === account.id);
  return {
    ...data,
    bankAccounts: exists
      ? data.bankAccounts.map((a) => (a.id === account.id ? account : a))
      : [...data.bankAccounts, account],
  };
}

export function deleteBankAccount(data: InvoiceAppData, id: string): InvoiceAppData {
  return { ...data, bankAccounts: data.bankAccounts.filter((a) => a.id !== id) };
}

export function updateProfile(data: InvoiceAppData, profile: Profile): InvoiceAppData {
  return { ...data, profile };
}

export function updateSettings(data: InvoiceAppData, settings: Settings): InvoiceAppData {
  return { ...data, settings };
}

export function updateTemplate(
  data: InvoiceAppData,
  template: TemplateCustomization
): InvoiceAppData {
  return { ...data, template };
}