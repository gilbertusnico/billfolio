/* ---------------- Shared domain types ---------------- */

export interface Profile {
  companyName: string;
  email: string;
  address: string;
  logoUrl: string;
}

export interface BankAccount {
  id: string;
  name: string;
  accountNumber: string;
  holder: string;
}

export interface Client {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientSnapshot {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface BankSnapshot {
  name: string;
  accountNumber: string;
  holder: string;
}

export type InvoiceStatus = "DRAFT" | "PENDING" | "PAID";

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  number: string;
  clientId: string | null;
  clientSnapshot: ClientSnapshot | null;
  projectName: string;
  invoiceDate: string; // ISO yyyy-mm-dd
  dueDate: string; // ISO yyyy-mm-dd
  items: InvoiceItem[];
  taxRate: number; // percent
  discount: number; // fixed amount in the invoice currency
  bankAccountId: string | null;
  bankSnapshot: BankSnapshot | null;
  notes: string;
  status: InvoiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  lastSequence: number;
  invoicePrefix: string;
  defaultTaxRate: number;
}

export type BorderThickness = 2 | 4 | 8;

export interface TemplateBorder {
  visible: boolean;
  color: string; // hex
  thickness: BorderThickness; // px
}

/** How the line-items table header is rendered on the document. */
export type TableHeaderStyle = "filled" | "minimal";

export interface TableStyleCustomization {
  headerStyle: TableHeaderStyle; // "filled" = soft bg tint, "minimal" = borders only
  headerColor: string; // hex — used when headerStyle === "filled"
  zebra: boolean; // alternating row backgrounds
}

/** Global invoice template styling — applied to every invoice document (preview + print). */
export interface TemplateCustomization {
  invoiceTitleColor: string; // "INVOICE" heading text color (default: primary accent)
  companyNameColor: string; // company name text color
  topBorder: TemplateBorder;
  bottomBorder: TemplateBorder;
  table: TableStyleCustomization;
}

/* ---------------- Multi-tenant / auth types ---------------- */

export type UserRole = "user" | "super_admin";

/** A BillFolio user (profiles table) — includes the raw password for the admin panel. */
export interface UserProfile {
  id: string;
  username: string;
  role: UserRole;
  rawPassword?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Per-company PDF styling + settings, persisted in `companies.styling` JSONB. */
export interface CompanyStyling {
  settings: Settings;
  template: TemplateCustomization;
}

export type CompanyMemberRole = "owner" | "admin" | "member";

export interface CompanyMember {
  userId: string;
  companyId: string;
  role: CompanyMemberRole;
  username: string;
  createdAt: string;
}

/** A company workspace (companies row) — Profile fields plus tenancy + styling. */
export interface Company extends Profile {
  id: string;
  ownerId: string;
  currency?: string;
  styling: CompanyStyling;
  createdAt: string;
  updatedAt: string;
}

/** Input used when creating a new company workspace. */
export interface CompanyInput {
  companyName: string;
  email: string;
  address: string;
  logoUrl: string;
}

/** Per-company data: every entity that belongs to one company workspace. */
export interface CompanyWorkspace {
  companyId: string;
  bankAccounts: BankAccount[];
  clients: Client[];
  invoices: Invoice[];
  settings: Settings;
  template: TemplateCustomization;
}

export interface InvoiceAppData {
  companies: Company[];
  workspaces: CompanyWorkspace[];
}

/**
 * The "active company" view — what pages consume. Slices the full store down to
 * the currently active company, with `profile` attached to the Company itself.
 */
export type CompanyView = CompanyWorkspace & { profile: Company };