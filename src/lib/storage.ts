import type {
  BankAccount,
  Client,
  Company,
  CompanyInput,
  CompanyWorkspace,
  Invoice,
  InvoiceAppData,
  Profile,
  Settings,
  TemplateCustomization,
} from "../types";

export const STORAGE_KEY = "invoice_app_data";
export const ACTIVE_COMPANY_KEY = "invoice_active_company_id";

/* Primary accent (blue-600) — used as the default template accent. */
export const ACCENT_COLOR = "#2563eb";

export const DEFAULT_TEMPLATE: TemplateCustomization = {
  invoiceTitleColor: ACCENT_COLOR,
  companyNameColor: "#0f172a",
  thankYouMessage: "Terima kasih atas kerja sama Anda.",
  topBorder: { visible: false, color: ACCENT_COLOR, thickness: 4 },
  bottomBorder: { visible: false, color: ACCENT_COLOR, thickness: 4 },
  table: { headerStyle: "filled", headerColor: "#eff6ff", zebra: false },
};

export const DEFAULT_SETTINGS: Settings = {
  lastSequence: 0,
  invoicePrefix: "INV-",
  defaultTaxRate: 0,
};

export const DEFAULT_DATA: InvoiceAppData = { companies: [], workspaces: [] };

const nowIso = () => new Date().toISOString();

/* ---------------- Company + workspace factories ---------------- */

export function makeCompany(
  input: Partial<CompanyInput> = {},
  id: string = crypto.randomUUID()
): Company {
  return {
    id,
    companyName: input.companyName?.trim() ?? "",
    email: input.email?.trim() ?? "",
    address: input.address?.trim() ?? "",
    logoUrl: input.logoUrl ?? "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function emptyWorkspace(companyId: string): CompanyWorkspace {
  return {
    companyId,
    bankAccounts: [],
    clients: [],
    invoices: [],
    settings: { ...DEFAULT_SETTINGS },
    template: structuredClone(DEFAULT_TEMPLATE),
  };
}

/* ---------------- Read / write / init ---------------- */

export function readInvoiceAppData(): InvoiceAppData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveInvoiceAppData(data: InvoiceAppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Returns existing data (migrating the legacy shape), or seeds a default company on first load. */
export function initInvoiceData(): InvoiceAppData {
  const existing = readInvoiceAppData();
  if (existing) return existing;
  const seeded = ensureCompanyShape(structuredClone(DEFAULT_DATA));
  saveInvoiceAppData(seeded);
  return seeded;
}

/* ---------------- Active company persistence ---------------- */

export function readActiveCompanyId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_COMPANY_KEY);
  } catch {
    return null;
  }
}

export function saveActiveCompanyId(id: string): void {
  localStorage.setItem(ACTIVE_COMPANY_KEY, id);
}

/* ---------------- Sanitize / migrate ---------------- */

function sanitizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Partial<Settings>;
  return {
    lastSequence: Number.isFinite(Number(r.lastSequence))
      ? Math.max(0, Number(r.lastSequence))
      : DEFAULT_SETTINGS.lastSequence,
    invoicePrefix:
      typeof r.invoicePrefix === "string" ? r.invoicePrefix : DEFAULT_SETTINGS.invoicePrefix,
    defaultTaxRate: Number.isFinite(Number(r.defaultTaxRate))
      ? Math.max(0, Number(r.defaultTaxRate))
      : DEFAULT_SETTINGS.defaultTaxRate,
  };
}

function sanitizeTemplate(raw: unknown): TemplateCustomization {
  const base = structuredClone(DEFAULT_TEMPLATE);
  const r = (raw ?? {}) as Partial<TemplateCustomization>;
  const thickness = (t: unknown) =>
    [2, 4, 8].includes(Number(t)) ? (Number(t) as 2 | 4 | 8) : base.topBorder.thickness;
  return {
    invoiceTitleColor:
      typeof r.invoiceTitleColor === "string" ? r.invoiceTitleColor : base.invoiceTitleColor,
    companyNameColor:
      typeof r.companyNameColor === "string" ? r.companyNameColor : base.companyNameColor,
    thankYouMessage:
      typeof r.thankYouMessage === "string" && r.thankYouMessage.trim()
        ? r.thankYouMessage.trim()
        : base.thankYouMessage,
    topBorder: {
      visible: typeof r.topBorder?.visible === "boolean" ? r.topBorder.visible : base.topBorder.visible,
      color: typeof r.topBorder?.color === "string" ? r.topBorder.color : base.topBorder.color,
      thickness: thickness(r.topBorder?.thickness),
    },
    bottomBorder: {
      visible:
        typeof r.bottomBorder?.visible === "boolean" ? r.bottomBorder.visible : base.bottomBorder.visible,
      color: typeof r.bottomBorder?.color === "string" ? r.bottomBorder.color : base.bottomBorder.color,
      thickness: thickness(r.bottomBorder?.thickness),
    },
    table: {
      headerStyle: r.table?.headerStyle === "minimal" ? "minimal" : "filled",
      headerColor:
        typeof r.table?.headerColor === "string" ? r.table.headerColor : base.table.headerColor,
      zebra: typeof r.table?.zebra === "boolean" ? r.table.zebra : base.table.zebra,
    },
  };
}

function sanitizeCompany(raw: unknown, index: number): Company {
  const r = (raw ?? {}) as Partial<Company>;
  const id = typeof r.id === "string" && r.id ? r.id : `company-${index}-${crypto.randomUUID()}`;
  return {
    id,
    companyName: typeof r.companyName === "string" ? r.companyName : "",
    email: typeof r.email === "string" ? r.email : "",
    address: typeof r.address === "string" ? r.address : "",
    logoUrl: typeof r.logoUrl === "string" ? r.logoUrl : "",
    createdAt: typeof r.createdAt === "string" ? r.createdAt : nowIso(),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : nowIso(),
  };
}

function sanitizeWorkspace(raw: unknown, companyId: string): CompanyWorkspace {
  const r = (raw ?? {}) as Partial<CompanyWorkspace>;
  return {
    companyId,
    bankAccounts: Array.isArray(r.bankAccounts) ? r.bankAccounts : [],
    clients: Array.isArray(r.clients) ? r.clients : [],
    invoices: Array.isArray(r.invoices) ? r.invoices : [],
    settings: sanitizeSettings(r.settings),
    template: sanitizeTemplate(r.template),
  };
}

/** Guarantees at least one company with a workspace; drops orphan workspaces, fills gaps. */
function ensureCompanyShape(data: InvoiceAppData): InvoiceAppData {
  const companies =
    data.companies.length > 0 ? data.companies : [makeCompany({ companyName: "My Company" })];
  const ids = new Set(companies.map((c) => c.id));
  const workspaces = data.workspaces
    .filter((w) => ids.has(w.companyId))
    .map((w) => sanitizeWorkspace(w, w.companyId));
  for (const company of companies) {
    if (!workspaces.some((w) => w.companyId === company.id)) {
      workspaces.push(emptyWorkspace(company.id));
    }
  }
  return { companies, workspaces };
}

/**
 * Guards against malformed/partial imports by merging with defaults.
 * Also migrates the legacy single-company shape (pre multi-company) into one workspace.
 */
export function sanitize(raw: unknown): InvoiceAppData {
  if (!raw || typeof raw !== "object") return ensureCompanyShape(structuredClone(DEFAULT_DATA));
  const r = raw as Record<string, unknown>;

  // New multi-company shape.
  if (Array.isArray(r.companies) || Array.isArray(r.workspaces)) {
    const companies = Array.isArray(r.companies)
      ? r.companies.map((c, i) => sanitizeCompany(c, i))
      : [];
    const workspaces = Array.isArray(r.workspaces)
      ? r.workspaces.map((w, i) => {
          const id = (w as { companyId?: unknown })?.companyId;
          return sanitizeWorkspace(w, typeof id === "string" && id ? id : `company-${i}`);
        })
      : [];
    return ensureCompanyShape({ companies, workspaces });
  }

  // Legacy single-company shape — wrap everything into one company workspace.
  const legacy = r as {
    profile?: Partial<CompanyInput>;
    bankAccounts?: BankAccount[];
    clients?: Client[];
    invoices?: Invoice[];
    settings?: Settings;
    template?: TemplateCustomization;
  };
  const company = makeCompany(legacy.profile ?? {}, "legacy-company");
  if (!company.companyName) company.companyName = "My Company";
  const workspace = sanitizeWorkspace(
    {
      bankAccounts: legacy.bankAccounts,
      clients: legacy.clients,
      invoices: legacy.invoices,
      settings: legacy.settings,
      template: legacy.template,
    },
    company.id
  );
  return ensureCompanyShape({ companies: [company], workspaces: [workspace] });
}

/* ---------------- CRUD helpers (pure — operate on one workspace) ---------------- */

export function upsertClient(ws: CompanyWorkspace, client: Client): CompanyWorkspace {
  const exists = ws.clients.some((c) => c.id === client.id);
  return {
    ...ws,
    clients: exists
      ? ws.clients.map((c) => (c.id === client.id ? client : c))
      : [...ws.clients, client],
  };
}

export function deleteClient(ws: CompanyWorkspace, id: string): CompanyWorkspace {
  return { ...ws, clients: ws.clients.filter((c) => c.id !== id) };
}

export function upsertInvoice(ws: CompanyWorkspace, invoice: Invoice): CompanyWorkspace {
  const exists = ws.invoices.some((i) => i.id === invoice.id);
  return {
    ...ws,
    invoices: exists
      ? ws.invoices.map((i) => (i.id === invoice.id ? invoice : i))
      : [...ws.invoices, invoice],
  };
}

export function deleteInvoice(ws: CompanyWorkspace, id: string): CompanyWorkspace {
  return { ...ws, invoices: ws.invoices.filter((i) => i.id !== id) };
}

export function upsertBankAccount(ws: CompanyWorkspace, account: BankAccount): CompanyWorkspace {
  const exists = ws.bankAccounts.some((a) => a.id === account.id);
  return {
    ...ws,
    bankAccounts: exists
      ? ws.bankAccounts.map((a) => (a.id === account.id ? account : a))
      : [...ws.bankAccounts, account],
  };
}

export function deleteBankAccount(ws: CompanyWorkspace, id: string): CompanyWorkspace {
  return { ...ws, bankAccounts: ws.bankAccounts.filter((a) => a.id !== id) };
}

export function updateSettings(ws: CompanyWorkspace, settings: Settings): CompanyWorkspace {
  return { ...ws, settings };
}

export function updateTemplate(ws: CompanyWorkspace, template: TemplateCustomization): CompanyWorkspace {
  return { ...ws, template };
}

/* ---------------- Company-level helpers ---------------- */

export function updateCompanyProfile(
  data: InvoiceAppData,
  companyId: string,
  profile: Profile
): InvoiceAppData {
  return {
    ...data,
    companies: data.companies.map((c) =>
      c.id === companyId ? { ...c, ...profile, updatedAt: nowIso() } : c
    ),
  };
}

export function removeCompany(data: InvoiceAppData, companyId: string): InvoiceAppData {
  return {
    companies: data.companies.filter((c) => c.id !== companyId),
    workspaces: data.workspaces.filter((w) => w.companyId !== companyId),
  };
}