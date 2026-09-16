import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  BankAccount,
  Client,
  Company,
  CompanyInput,
  CompanyView,
  CompanyWorkspace,
  Invoice,
  InvoiceAppData,
  Profile,
  Settings,
  TemplateCustomization,
} from "../types";
import {
  DEFAULT_DATA,
  DEFAULT_SETTINGS,
  DEFAULT_TEMPLATE,
  deleteBankAccount as deleteBankAccountPure,
  deleteClient as deleteClientPure,
  deleteInvoice as deleteInvoicePure,
  emptyWorkspace,
  initInvoiceData,
  makeCompany,
  readActiveCompanyId,
  removeCompany as removeCompanyPure,
  sanitize,
  saveActiveCompanyId,
  saveInvoiceAppData,
  updateCompanyProfile as updateCompanyProfilePure,
  updateSettings as updateSettingsPure,
  updateTemplate as updateTemplatePure,
  upsertBankAccount as upsertBankAccountPure,
  upsertClient as upsertClientPure,
  upsertInvoice as upsertInvoicePure,
} from "../lib/storage";

interface InvoiceDataContextValue {
  /** Sliced view of the ACTIVE company — what pages should consume. */
  data: CompanyView;
  /** Full multi-company store — used for export/import. */
  storage: InvoiceAppData;
  companies: Company[];
  activeCompany: Company | null;
  activeCompanyId: string | null;
  isLoading: boolean;
  setActiveCompany: (id: string) => void;
  addCompany: (input: CompanyInput) => Company;
  updateCompany: (id: string, profile: Profile) => void;
  removeCompany: (id: string) => void;
  replaceData: (data: InvoiceAppData) => void;
  upsertClient: (client: Client) => void;
  deleteClient: (id: string) => void;
  upsertInvoice: (invoice: Invoice) => void;
  deleteInvoice: (id: string) => void;
  upsertBankAccount: (account: BankAccount) => void;
  deleteBankAccount: (id: string) => void;
  updateProfile: (profile: Profile) => void;
  updateSettings: (settings: Settings) => void;
  updateTemplate: (template: TemplateCustomization) => void;
}

const InvoiceDataContext = createContext<InvoiceDataContextValue | null>(null);

const FALLBACK_VIEW: CompanyView = {
  companyId: "",
  profile: makeCompany({ companyName: "My Company" }),
  bankAccounts: [],
  clients: [],
  invoices: [],
  settings: { ...DEFAULT_SETTINGS },
  template: structuredClone(DEFAULT_TEMPLATE),
};

export function InvoiceDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ data: InvoiceAppData; isLoading: boolean }>({
    data: DEFAULT_DATA,
    isLoading: true,
  });
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const activeCompanyIdRef = useRef<string | null>(null);

  // Rehydrate once from LocalStorage on mount (init migrates + seeds defaults).
  useEffect(() => {
    const data = initInvoiceData();
    const stored = readActiveCompanyId();
    const valid = data.companies.some((c) => c.id === stored)
      ? stored
      : data.companies[0]?.id ?? null;
    activeCompanyIdRef.current = valid;
    setState({ data, isLoading: false });
    setActiveCompanyIdState(valid);
    if (valid) saveActiveCompanyId(valid);
  }, []);

  // Persist the active company whenever it changes.
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    if (activeCompanyId) saveActiveCompanyId(activeCompanyId);
  }, [activeCompanyId]);

  // Self-heal: if the active company disappears (import/replace), fall back to the first one.
  useEffect(() => {
    if (state.isLoading) return;
    if (activeCompanyId && !state.data.companies.some((c) => c.id === activeCompanyId)) {
      setActiveCompanyIdState(state.data.companies[0]?.id ?? null);
    }
  }, [state.data, state.isLoading, activeCompanyId]);

  // Slice the active company's workspace + profile into the "data" view.
  const view = useMemo<CompanyView | null>(() => {
    const company =
      state.data.companies.find((c) => c.id === activeCompanyId) ?? state.data.companies[0] ?? null;
    if (!company) return null;
    const ws = state.data.workspaces.find((w) => w.companyId === company.id) ?? emptyWorkspace(company.id);
    return { ...ws, profile: company };
  }, [state.data, activeCompanyId]);

  // Single write-through path: mutate → persist → re-render.
  const mutate = useCallback((fn: (data: InvoiceAppData) => InvoiceAppData) => {
    setState((prev) => {
      const next = fn(prev.data);
      saveInvoiceAppData(next);
      return { data: next, isLoading: false };
    });
  }, []);

  // Mutations scoped to the active company's workspace.
  const mutateWorkspace = useCallback(
    (fn: (ws: CompanyWorkspace) => CompanyWorkspace) => {
      const companyId = activeCompanyIdRef.current;
      if (!companyId) return;
      mutate((d) => ({
        ...d,
        workspaces: d.workspaces.map((w) => (w.companyId === companyId ? fn(w) : w)),
      }));
    },
    [mutate]
  );

  const setActiveCompany = useCallback((id: string) => {
    setActiveCompanyIdState(id);
  }, []);

  const addCompany = useCallback(
    (input: CompanyInput): Company => {
      const company = makeCompany(input);
      mutate((d) => ({
        companies: [...d.companies, company],
        workspaces: [...d.workspaces, emptyWorkspace(company.id)],
      }));
      setActiveCompanyIdState(company.id);
      return company;
    },
    [mutate]
  );

  const updateCompany = useCallback(
    (id: string, profile: Profile) => {
      mutate((d) => updateCompanyProfilePure(d, id, profile));
    },
    [mutate]
  );

  const removeCompany = useCallback(
    (id: string) => {
      mutate((d) => removeCompanyPure(d, id));
      setActiveCompanyIdState((prev) => (prev === id ? null : prev));
    },
    [mutate]
  );

  const updateProfile = useCallback(
    (profile: Profile) => {
      const id = activeCompanyIdRef.current;
      if (id) updateCompany(id, profile);
    },
    [updateCompany]
  );

  const replaceData = useCallback((d: InvoiceAppData) => {
    const cleaned = sanitize(d);
    saveInvoiceAppData(cleaned);
    setState({ data: cleaned, isLoading: false });
    setActiveCompanyIdState((prev) =>
      cleaned.companies.some((c) => c.id === prev) ? prev : cleaned.companies[0]?.id ?? null
    );
  }, []);

  const value: InvoiceDataContextValue = {
    data: view ?? FALLBACK_VIEW,
    storage: state.data,
    companies: state.data.companies,
    activeCompany: view?.profile ?? null,
    activeCompanyId,
    isLoading: state.isLoading,
    setActiveCompany,
    addCompany,
    updateCompany,
    removeCompany,
    replaceData,
    upsertClient: useCallback(
      (c: Client) => mutateWorkspace((w) => upsertClientPure(w, c)),
      [mutateWorkspace]
    ),
    deleteClient: useCallback(
      (id: string) => mutateWorkspace((w) => deleteClientPure(w, id)),
      [mutateWorkspace]
    ),
    upsertInvoice: useCallback(
      (i: Invoice) => mutateWorkspace((w) => upsertInvoicePure(w, i)),
      [mutateWorkspace]
    ),
    deleteInvoice: useCallback(
      (id: string) => mutateWorkspace((w) => deleteInvoicePure(w, id)),
      [mutateWorkspace]
    ),
    upsertBankAccount: useCallback(
      (a: BankAccount) => mutateWorkspace((w) => upsertBankAccountPure(w, a)),
      [mutateWorkspace]
    ),
    deleteBankAccount: useCallback(
      (id: string) =>
        mutateWorkspace((w) => ({
          ...deleteBankAccountPure(w, id),
          invoices: w.invoices.map((i) =>
            i.bankAccountId === id ? { ...i, bankAccountId: "" } : i
          ),
        })),
      [mutateWorkspace]
    ),
    updateProfile,
    updateSettings: useCallback(
      (s: Settings) => mutateWorkspace((w) => updateSettingsPure(w, s)),
      [mutateWorkspace]
    ),
    updateTemplate: useCallback(
      (t: TemplateCustomization) => mutateWorkspace((w) => updateTemplatePure(w, t)),
      [mutateWorkspace]
    ),
  };

  return <InvoiceDataContext.Provider value={value}>{children}</InvoiceDataContext.Provider>;
}

export function useInvoiceData(): InvoiceDataContextValue {
  const ctx = useContext(InvoiceDataContext);
  if (!ctx) throw new Error("useInvoiceData must be used within <InvoiceDataProvider>");
  return ctx;
}