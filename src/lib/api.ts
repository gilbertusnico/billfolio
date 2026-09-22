import { createClient } from "@supabase/supabase-js";
import type {
  BankAccount,
  Client,
  Company,
  CompanyInput,
  CompanyMember,
  CompanyStyling,
  Invoice,
  Settings,
  TemplateCustomization,
  UserProfile,
} from "../types";

/* ---------------------------------------------------------------------------
 * Supabase client
 * ---------------------------------------------------------------------------
 * The URL + anon key are PUBLISHABLE by design — Supabase anon keys ship inside
 * every browser bundle; all real security is enforced server-side by RLS
 * (see supabase/migrations/0001_init.sql). NEVER put a service_role key here.
 *
 * The values come from the platform env-var store (VITE_ prefix → inlined into
 * the client bundle at build time). Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * in Environment settings — linking a Supabase project does this automatically.
 * ------------------------------------------------------------------------- */

function requiredEnv(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  if (!value) {
    throw new Error(
      `Missing ${name} — add it in the project's Environment settings (VITE_ prefix required for browser code).`
    );
  }
  return value;
}

export const SUPABASE_URL = requiredEnv("VITE_SUPABASE_URL");
export const SUPABASE_ANON_KEY = requiredEnv("VITE_SUPABASE_ANON_KEY");

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Dummy email domain appended to usernames for Supabase Auth compatibility. */
export const INTERNAL_EMAIL_DOMAIN = "internal.app";
export const emailForUsername = (username: string) =>
  `${username.trim().toLowerCase().replace(/\s+/g, ".")}@${INTERNAL_EMAIL_DOMAIN}`;

/* ---------------------------------------------------------------------------
 * Defaults + sanitizers (mirror of the old LocalStorage defaults — now the
 * starting point for every new company's `styling` JSONB column).
 * ------------------------------------------------------------------------- */

export const ACCENT_COLOR = "#2563eb";

export const DEFAULT_SETTINGS: Settings = {
  lastSequence: 0,
  invoicePrefix: "INV-",
  defaultTaxRate: 0,
};

export const DEFAULT_TEMPLATE: TemplateCustomization = {
  invoiceTitleColor: ACCENT_COLOR,
  companyNameColor: "#0f172a",
  topBorder: { visible: false, color: ACCENT_COLOR, thickness: 4 },
  bottomBorder: { visible: false, color: ACCENT_COLOR, thickness: 4 },
  table: { headerStyle: "filled", headerColor: "#eff6ff", zebra: false },
};

export const DEFAULT_STYLING: CompanyStyling = {
  settings: { ...DEFAULT_SETTINGS },
  template: structuredClone(DEFAULT_TEMPLATE),
};

export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Partial<Settings>;
  const lastSequence = Number(r.lastSequence);
  return {
    lastSequence: Number.isFinite(lastSequence) ? Math.max(0, Math.floor(lastSequence)) : 0,
    invoicePrefix: typeof r.invoicePrefix === "string" ? r.invoicePrefix : "INV-",
    defaultTaxRate: Number.isFinite(Number(r.defaultTaxRate))
      ? Math.max(0, Number(r.defaultTaxRate))
      : 0,
  };
}

export function sanitizeTemplate(raw: unknown): TemplateCustomization {
  const base = structuredClone(DEFAULT_TEMPLATE);
  const r = (raw ?? {}) as Partial<TemplateCustomization>;
  const thickness = (t: unknown) =>
    [2, 4, 8].includes(Number(t)) ? (Number(t) as 2 | 4 | 8) : base.topBorder.thickness;
  return {
    invoiceTitleColor:
      typeof r.invoiceTitleColor === "string" ? r.invoiceTitleColor : base.invoiceTitleColor,
    companyNameColor:
      typeof r.companyNameColor === "string" ? r.companyNameColor : base.companyNameColor,
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
      headerColor: typeof r.table?.headerColor === "string" ? r.table.headerColor : base.table.headerColor,
      zebra: typeof r.table?.zebra === "boolean" ? r.table.zebra : base.table.zebra,
    },
  };
}

export function sanitizeStyling(raw: unknown): CompanyStyling {
  const r = (raw ?? {}) as Partial<CompanyStyling>;
  return { settings: sanitizeSettings(r.settings), template: sanitizeTemplate(r.template) };
}

/* ---------------------------------------------------------------------------
 * Row → domain mappers
 * ------------------------------------------------------------------------- */

type CompanyRow = {
  id: string;
  name: string;
  owner_id: string;
  email: string | null;
  address: string | null;
  logo_url: string | null;
  currency: string | null;
  styling: unknown;
  created_at: string;
  updated_at: string;
};

export function mapCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    companyName: row.name ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    logoUrl: row.logo_url ?? "",
    ownerId: row.owner_id,
    currency: row.currency ?? "USD",
    styling: sanitizeStyling(row.styling),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type ProfileRow = {
  id: string;
  username: string;
  role: "user" | "super_admin";
  created_at: string;
  updated_at: string;
};

function mapProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type ClientRow = {
  id: string;
  name: string;
  contact_company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
};

function mapClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    company: row.contact_company || undefined,
    email: row.email || undefined,
    phone: row.phone || undefined,
    address: row.address || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type BankRow = {
  id: string;
  name: string;
  account_number: string;
  holder: string;
  created_at: string;
  updated_at: string;
};

function mapBankAccount(row: BankRow): BankAccount {
  return {
    id: row.id,
    name: row.name,
    accountNumber: row.account_number ?? "",
    holder: row.holder ?? "",
  };
}

type InvoiceRow = {
  id: string;
  number: string;
  client_id: string | null;
  client_snapshot: unknown;
  project_name: string | null;
  invoice_date: string;
  due_date: string;
  tax_rate: number | string;
  discount: number | string;
  subtotal: number | string;
  tax_amount: number | string;
  grand_total: number | string;
  bank_account_id: string | null;
  bank_snapshot: unknown;
  notes: string | null;
  status: "DRAFT" | "PENDING" | "PAID" | "FAILED";
  paid_at: string | null;
  payment_reported_at: string | null;
  items: unknown;
  created_at: string;
  updated_at: string;
};

function mapInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    number: row.number,
    clientId: row.client_id,
    clientSnapshot: (row.client_snapshot as Invoice["clientSnapshot"]) ?? null,
    projectName: row.project_name ?? "",
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    items: Array.isArray(row.items) ? (row.items as Invoice["items"]) : [],
    taxRate: Number(row.tax_rate) || 0,
    discount: Number(row.discount) || 0,
    subtotal: Number(row.subtotal) || 0,
    taxAmount: Number(row.tax_amount) || 0,
    grandTotal: Number(row.grand_total) || 0,
    bankAccountId: row.bank_account_id,
    bankSnapshot: (row.bank_snapshot as Invoice["bankSnapshot"]) ?? null,
    notes: row.notes ?? "",
    status: row.status ?? "DRAFT",
    paidAt: row.paid_at ?? null,
    paymentReportedAt: row.payment_reported_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function unwrap(error: { message?: string; code?: string; status?: number } | null, fallback: string): Error {
  const raw = error?.message ?? "";
  const cleaned = raw.replace(/^Database error saving|^Database error/i, "").trim();

  if (/users_email_partial_key|duplicate key value violates unique constraint/i.test(cleaned)) {
    return new Error("Username is already in use. Please choose another username.");
  }

  const status = error?.status;
  if (status === 401 || status === 403 || /row-level security|permission denied/i.test(cleaned)) {
    return new Error(
      `Supabase denied access to this data. Run supabase/migrations/0002_grants.sql in the Supabase SQL Editor, then verify the signed-in user is a member of the selected company. Details: ${cleaned || `HTTP ${status}`}`
    );
  }

  // "permission denied for table X" = Supabase RLS table grants belum diterapkan.
  // Terjemahkan ke instruksi konkret alih-alih error mentah yang membingungkan.
  return new Error(cleaned || fallback);
}

/* ---------------------------------------------------------------------------
 * Auth
 * ------------------------------------------------------------------------- */

export async function signInWithUsername(username: string, password: string) {
  const email = emailForUsername(username);
  return supabase.auth.signInWithPassword({ email, password });
}

export async function changeOwnPassword(newPassword: string): Promise<void> {
  const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
  if (authError) throw unwrap(authError, "We couldn't update your password — try again.");
}

export async function signOutUser(): Promise<void> {
  await supabase.auth.signOut();
}

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();
  if (error) throw unwrap(error, "We couldn't load your profile.");
  return data ? mapProfile(data) : null;
}

/** Creates a minimal profile row for the signed-in user if one is missing. */
export async function ensureProfile(userId: string, fallbackUsername: string): Promise<void> {
  const { error } = await supabase.from("profiles").insert({
    id: userId,
    username: fallbackUsername || "user",
    role: "user",
  } as never);
  // 23505 = unique violation — another process created it first. Either way we're fine.
  if (error && (error as { code?: string }).code !== "23505") {
    throw unwrap(error, "We couldn't set up your profile.");
  }
}

/* ---------------------------------------------------------------------------
 * Companies & workspaces
 * ------------------------------------------------------------------------- */

/**
 * Workspaces visible to the signed-in user — only companies they own or are a
 * member of. RLS `companies_select` now scopes this identically for every
 * role (Super Admin included), so the sidebar switcher never lists companies
 * the user has no access to.
 */
export async function fetchUserCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw unwrap(error, "We couldn't load your companies.");
  return (data ?? []).map((row) => mapCompany(row as unknown as CompanyRow));
}

/**
 * Every company in BillFolio — Super Admin only (enforced inside the
 * security-definer RPC). Used by the /admin/companies page to manage access
 * across all workspaces, while the in-app picker stays scoped to own/member.
 */
export async function fetchAllCompaniesAdmin(): Promise<Company[]> {
  const { data, error } = await supabase.rpc("admin_list_all_companies");
  if (error) throw unwrap(error, "We couldn't load all companies.");
  return (data ?? []).map((row: CompanyRow) => mapCompany(row));
}

export async function createCompanyForUser(input: CompanyInput): Promise<Company> {
  const { data, error } = await supabase.rpc("create_company", {
    p_name: input.companyName,
    p_email: input.email,
    p_address: input.address,
    p_logo_url: input.logoUrl,
  });
  if (error) throw unwrap(error, "We couldn't create that company.");
  return mapCompany(data as unknown as CompanyRow);
}

export async function updateCompanyProfile(
  companyId: string,
  profile: { companyName: string; email: string; address: string; logoUrl: string }
): Promise<void> {
  const { error } = await supabase
    .from("companies")
    .update({
      name: profile.companyName,
      email: profile.email,
      address: profile.address,
      logo_url: profile.logoUrl,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", companyId);
  if (error) throw unwrap(error, "We couldn't save the company profile.");
}

export async function updateCompanyStyling(companyId: string, styling: CompanyStyling): Promise<void> {
  const { error } = await supabase
    .from("companies")
    .update({ styling, updated_at: new Date().toISOString() } as never)
    .eq("id", companyId);
  if (error) throw unwrap(error, "We couldn't save the invoice style.");
}

export async function deleteCompanyRow(companyId: string): Promise<void> {
  const { error } = await supabase.from("companies").delete().eq("id", companyId);
  if (error) throw unwrap(error, "We couldn't delete that company.");
}

/**
 * Soft-delete a company — Super Admin only (enforced inside the RPC). Sets
 * companies.deleted_at so the workspace vanishes everywhere (sidebar picker,
 * admin list, public invoice links) while the row stays intact for recovery.
 */
export async function adminSoftDeleteCompany(companyId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_soft_delete_company", {
    p_company_id: companyId,
  });
  if (error) throw unwrap(error, "We couldn't delete that company.");
}

export interface WorkspacePayload {
  clients: Client[];
  bankAccounts: BankAccount[];
  invoices: Invoice[];
}

export async function fetchWorkspace(companyId: string): Promise<WorkspacePayload> {
  const [clientsRes, accountsRes, invoicesRes] = await Promise.all([
    supabase.from("clients").select("*").eq("company_id", companyId).order("created_at", { ascending: true }),
    supabase.from("bank_accounts").select("*").eq("company_id", companyId).order("created_at", { ascending: true }),
    supabase.from("invoices").select("*").eq("company_id", companyId).order("created_at", { ascending: true }),
  ]);
  if (clientsRes.error) throw unwrap(clientsRes.error, "We couldn't load clients.");
  if (accountsRes.error) throw unwrap(accountsRes.error, "We couldn't load bank accounts.");
  if (invoicesRes.error) throw unwrap(invoicesRes.error, "We couldn't load invoices.");
  return {
    clients: (clientsRes.data ?? []).map((r) => mapClient(r as unknown as ClientRow)),
    bankAccounts: (accountsRes.data ?? []).map((r) => mapBankAccount(r as unknown as BankRow)),
    invoices: (invoicesRes.data ?? []).map((r) => mapInvoice(r as unknown as InvoiceRow)),
  };
}

/* ---------------------------------------------------------------------------
 * Workspace CRUD (scoped by company_id; RLS enforces tenancy)
 * ------------------------------------------------------------------------- */

export async function upsertClientRow(companyId: string, client: Client): Promise<void> {
  const { error } = await supabase
    .from("clients")
    .upsert({
      id: client.id,
      company_id: companyId,
      name: client.name,
      contact_company: client.company ?? "",
      email: client.email ?? "",
      phone: client.phone ?? "",
      address: client.address ?? "",
      updated_at: client.updatedAt,
    } as never);
  if (error) throw unwrap(error, "We couldn't save the client.");
}

export async function deleteClientRow(clientId: string): Promise<void> {
  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) throw unwrap(error, "We couldn't delete the client.");
}

export async function upsertBankAccountRow(companyId: string, account: BankAccount): Promise<void> {
  const { error } = await supabase
    .from("bank_accounts")
    .upsert({
      id: account.id,
      company_id: companyId,
      name: account.name,
      account_number: account.accountNumber,
      holder: account.holder,
      updated_at: new Date().toISOString(),
    } as never);
  if (error) throw unwrap(error, "We couldn't save the bank account.");
}

export async function deleteBankAccountRow(accountId: string): Promise<void> {
  const { error } = await supabase.from("bank_accounts").delete().eq("id", accountId);
  if (error) throw unwrap(error, "We couldn't delete the bank account.");
}

export async function upsertInvoiceRow(companyId: string, invoice: Invoice): Promise<void> {
  const { error } = await supabase
    .from("invoices")
    .upsert(
      {
        id: invoice.id,
        company_id: companyId,
        number: invoice.number,
        client_id: invoice.clientId,
        client_snapshot: invoice.clientSnapshot,
        project_name: invoice.projectName,
        invoice_date: invoice.invoiceDate,
        due_date: invoice.dueDate,
        tax_rate: invoice.taxRate,
        discount: invoice.discount,
        bank_account_id: invoice.bankAccountId,
        bank_snapshot: invoice.bankSnapshot,
        notes: invoice.notes,
        status: invoice.status,
        paid_at: invoice.paidAt,
        payment_reported_at: invoice.paymentReportedAt,
        items: invoice.items,
        updated_at: invoice.updatedAt,
      } as never,
      { onConflict: "id" }
    );
  if (error) throw unwrap(error, "We couldn't save the invoice.");
}

export async function deleteInvoiceRow(invoiceId: string): Promise<void> {
  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
  if (error) throw unwrap(error, "We couldn't delete the invoice.");
}

export async function verifyReportedPayment(invoiceId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("verify_reported_payment", {
    p_invoice_id: invoiceId,
  });
  if (error) throw unwrap(error, "We couldn't verify that payment report.");
  return Boolean(data);
}

/* ---------------------------------------------------------------------------
 * Super Admin: user management + company access assignment
 * ------------------------------------------------------------------------- */

export async function fetchAllUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase.from("profiles").select("*").order("username", { ascending: true });
  if (error) throw unwrap(error, "We couldn't load users.");
  return (data ?? []).map((row) => mapProfile(row as unknown as ProfileRow));
}

export async function adminCreateUser(
  username: string,
  password: string,
  role: "user" | "super_admin" = "user"
): Promise<void> {
  const { error } = await supabase.rpc("admin_create_user", {
    p_username: username,
    p_password: password,
    p_role: role,
  });
  if (error) throw unwrap(error, "We couldn't create that user.");
}

export async function adminUpdateUser(
  userId: string,
  patch: { username?: string; role?: "user" | "super_admin"; password?: string }
): Promise<void> {
  const { error } = await supabase.rpc("update_user", {
    p_user_id: userId,
    p_username: patch.username ?? null,
    p_role: patch.role ?? null,
    p_password: patch.password ?? null,
  });
  if (error) throw unwrap(error, "We couldn't update that user.");
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_user", { p_user_id: userId });
  if (error) throw unwrap(error, "We couldn't delete that user.");
}

export async function fetchCompanyMembers(): Promise<CompanyMember[]> {
  const { data, error } = await supabase.from("company_members").select("*");
  if (error) throw unwrap(error, "We couldn't load company access.");
  const rows = data ?? [];
  const userIds = [...new Set(rows.map((r) => r.user_id as string))];
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", userIds.length ? userIds : [""]);
  const names = new Map<string, string>(
    (profileRows ?? []).map((p) => [p.id as string, p.username as string])
  );
  return rows.map((r) => ({
    userId: r.user_id as string,
    companyId: r.company_id as string,
    role: r.role as CompanyMember["role"],
    username: names.get(r.user_id as string) ?? "unknown",
    createdAt: r.created_at as string,
  }));
}

/** Replaces the full member list of a company with `userIds` (Super Admin only). */
export async function setCompanyUsers(companyId: string, userIds: string[]): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId);
  if (fetchError) throw unwrap(fetchError, "We couldn't read the current access list.");

  const current = new Set((existing ?? []).map((r) => r.user_id as string));
  const next = new Set(userIds);
  const toAdd = userIds.filter((uid) => !current.has(uid));
  const toRemove = [...current].filter((uid) => !next.has(uid));

  if (toRemove.length > 0) {
    const { error: delErr } = await supabase
      .from("company_members")
      .delete()
      .eq("company_id", companyId)
      .in("user_id", toRemove);
    if (delErr) throw unwrap(delErr, "We couldn't remove access.");
  }
  if (toAdd.length > 0) {
    const { error: addErr } = await supabase.from("company_members").insert(
      toAdd.map((uid) => ({ company_id: companyId, user_id: uid, role: "member" })) as never
    );
    if (addErr) throw unwrap(addErr, "We couldn't grant access.");
  }
}

/** Resolution helper so callers can show human-readable errors. */
export function friendlyError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong — please try again.";
}
