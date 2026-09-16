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

export interface InvoiceAppData {
  profile: Profile;
  bankAccounts: BankAccount[];
  clients: Client[];
  invoices: Invoice[];
  settings: Settings;
  template: TemplateCustomization;
}