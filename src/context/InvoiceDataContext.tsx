import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type {
  BankAccount,
  Client,
  Company,
  CompanyInput,
  CompanyStyling,
  CompanyView,
  CompanyWorkspace,
  Invoice,
  InvoiceAppData,
  Profile,
  Settings,
  TemplateCustomization,
  UserProfile,
} from "../types";
import {
  DEFAULT_SETTINGS,
  DEFAULT_TEMPLATE,
  changeOwnPassword,
  createCompanyForUser,
  deleteBankAccountRow,
  deleteClientRow,
  deleteCompanyRow,
  deleteInvoiceRow,
  ensureProfile,
  fetchUserCompanies,
  fetchUserProfile,
  fetchWorkspace,
  friendlyError,
  seedSuperAdmin,
  signOutUser,
  supabase,
  updateCompanyProfile,
  updateCompanyStyling,
  upsertBankAccountRow,
  upsertClientRow,
  upsertInvoiceRow,
} from "../lib/api";
import { useToast } from "../components/Toast";

const ACTIVE_COMPANY_KEY = "invoice_app_active_company_id";

export type WorkspaceView = CompanyWorkspace & { profile: Company };

interface InvoiceDataContextValue {
  /* Auth */
  user: User | null;
  userProfile: UserProfile | null;
  isSuperAdmin: boolean;
  authLoading: boolean;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;

  /** Sliced view of the ACTIVE company — what pages should consume. */
  data: CompanyView;
  /** Snapshot used by the Settings export feature. */
  storage: InvoiceAppData;
  companies: Company[];
  activeCompany: Company | null;
  activeCompanyId: string | null;
  isLoading: boolean;
  /** A signed-in non-admin with no companies is locked into onboarding. */
  needsOnboarding: boolean;

  setActiveCompany: (id: string) => void;
  addCompany: (input: CompanyInput) => Promise<Company>;
  updateCompany: (id: string, profile: Profile) => Promise<void>;
  removeCompany: (id: string) => Promise<void>;
  upsertClient: (client: Client) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  upsertInvoice: (invoice: Invoice) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  upsertBankAccount: (account: BankAccount) => Promise<void>;
  deleteBankAccount: (id: string) => Promise<void>;
  updateProfile: (profile: Profile) => Promise<void>;
  updateSettings: (settings: Settings) => Promise<void>;
  updateTemplate: (template: TemplateCustomization) => Promise<void>;
}

const InvoiceDataContext = createContext<InvoiceDataContextValue | null>(null);

function fallbackCompany(): Company {
  return {
    id: "",
    companyName: "My Company",
    email: "",
    address: "",
    logoUrl: "",
    ownerId: "",
    styling: { settings: { ...DEFAULT_SETTINGS }, template: structuredClone(DEFAULT_TEMPLATE) },
    createdAt: "",
    updatedAt: "",
  };
}

const FALLBACK_VIEW: WorkspaceView = {
  companyId: "",
  profile: fallbackCompany(),
  bankAccounts: [],
  clients: [],
  invoices: [],
  settings: { ...DEFAULT_SETTINGS },
  template: structuredClone(DEFAULT_TEMPLATE),
};

export function InvoiceDataProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [view, setView] = useState<WorkspaceView | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);

  // Refs so callbacks never read stale values.
  const companiesRef = useRef<Company[]>([]);
  const activeCompanyIdRef = useRef<string | null>(null);
  const profileRef = useRef<UserProfile | null>(null);
  const loadSeq = useRef(0);

  useEffect(() => {
    companiesRef.current = companies;
  }, [companies]);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const failToast = (err: unknown) => showToast(friendlyError(err), "error");

  /* ------------------------------------------------------------------ */
  /* Loading a company's workspace                                       */
  /* ------------------------------------------------------------------ */

  const loadWorkspace = useCallback(async (companyId: string) => {
    const seq = ++loadSeq.current;
    setWorkspaceLoading(true);
    try {
      const company = companiesRef.current.find((c) => c.id === companyId);
      const payload = await fetchWorkspace(companyId);
      if (seq !== loadSeq.current) return; // superseded by a newer request
      if (!company || companyId !== activeCompanyIdRef.current) return;
      setView({
        companyId,
        ...payload,
        settings: company.styling.settings,
        template: company.styling.template,
        profile: company,
      });
    } catch (err) {
      if (seq === loadSeq.current) failToast(err);
    } finally {
      if (seq === loadSeq.current) setWorkspaceLoading(false);
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /* Bootstrap: session → profile → companies → active company           */
  /* ------------------------------------------------------------------ */

  const hydrateUser = useCallback(
    async (authUser: User) => {
      setUser(authUser);
      let prof = await fetchUserProfile(authUser.id).catch(() => null);
      if (!prof) {
        const fallbackName = (authUser.email ?? "user").split("@")[0] || "user";
        await ensureProfile(authUser.id, fallbackName).catch(() => undefined);
        prof = await fetchUserProfile(authUser.id).catch(() => null);
      }
      setProfile(prof);

      const list = await fetchUserCompanies();
      companiesRef.current = list;
      setCompanies(list);

      const stored = localStorage.getItem(ACTIVE_COMPANY_KEY);
      const nextActive = list.some((c) => c.id === stored) ? stored : list[0]?.id ?? null;
      setActiveCompanyIdState(nextActive);
      if (nextActive) {
        localStorage.setItem(ACTIVE_COMPANY_KEY, nextActive);
        void loadWorkspace(nextActive);
      }
    },
    [loadWorkspace]
  );

  const resetAll = useCallback(() => {
    companiesRef.current = [];
    activeCompanyIdRef.current = null;
    setCompanies([]);
    setActiveCompanyIdState(null);
    setView(null);
    setProfile(null);
    setUser(null);
    setWorkspaceLoading(false);
    localStorage.removeItem(ACTIVE_COMPANY_KEY);
  }, []);

  // Subscribe to auth changes; on first mount it restores the current session.
  useEffect(() => {
    let alive = true;

    const bootstrap = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!alive) return;
        if (session?.user) {
          try {
            await hydrateUser(session.user);
          } catch (err) {
            // Jangan biarkan gagal bootstrap jadi unhandled rejection — tampilkan
            // pesan yang bisa ditindaklanjuti (mis. instruksi setup DB Supabase).
            showToast(friendlyError(err), "error");
          }
        } else {
          await seedSuperAdmin().catch(() => undefined);
        }
      } finally {
        if (alive) setAuthReady(true);
      }
    };
    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT" || event === "USER_UPDATED" && !nextSession?.user) {
        resetAll();
        setAuthReady(true);
        return;
      }
      if (nextSession?.user) {
        void hydrateUser(nextSession.user).catch((err) => showToast(friendlyError(err), "error"));
      }
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [hydrateUser, resetAll]);

  /* ------------------------------------------------------------------ */
  /* Active company switching                                            */
  /* ------------------------------------------------------------------ */

  const setActiveCompany = useCallback(
    (id: string) => {
      const company = companiesRef.current.find((c) => c.id === id);
      if (!company) return;
      setActiveCompanyIdState(id);
      localStorage.setItem(ACTIVE_COMPANY_KEY, id);
      void loadWorkspace(id);
    },
    [loadWorkspace]
  );

  /* ------------------------------------------------------------------ */
  /* Company mutations                                                   */
  /* ------------------------------------------------------------------ */

  const addCompany = useCallback(
    async (input: CompanyInput): Promise<Company> => {
      const company = await createCompanyForUser(input);
      companiesRef.current = [...companiesRef.current, company];
      setCompanies(companiesRef.current);
      setActiveCompanyIdState(company.id);
      localStorage.setItem(ACTIVE_COMPANY_KEY, company.id);
      void loadWorkspace(company.id);
      return company;
    },
    [loadWorkspace]
  );

  const updateCompany = useCallback(async (id: string, p: Profile) => {
    await updateCompanyProfile(id, p);
    companiesRef.current = companiesRef.current.map((c) =>
      c.id === id
        ? {
            ...c,
            companyName: p.companyName,
            email: p.email,
            address: p.address,
            logoUrl: p.logoUrl,
            updatedAt: new Date().toISOString(),
          }
        : c
    );
    setCompanies(companiesRef.current);
    setView((v) =>
      v && v.profile.id === id
        ? { ...v, profile: companiesRef.current.find((c) => c.id === id)! }
        : v
    );
  }, []);

  const removeCompany = useCallback(async (id: string) => {
    await deleteCompanyRow(id);
    companiesRef.current = companiesRef.current.filter((c) => c.id !== id);
    setCompanies(companiesRef.current);
    if (activeCompanyIdRef.current === id) {
      const next = companiesRef.current[0]?.id ?? null;
      setActiveCompanyIdState(next);
      if (next) {
        localStorage.setItem(ACTIVE_COMPANY_KEY, next);
        void loadWorkspace(next);
      } else {
        localStorage.removeItem(ACTIVE_COMPANY_KEY);
        setView(null);
      }
    }
  }, []);

  const applyStyling = useCallback(async (patch: Partial<CompanyStyling>) => {
    const id = activeCompanyIdRef.current;
    const company = companiesRef.current.find((c) => c.id === id);
    if (!id || !company) return;
    const styling: CompanyStyling = { ...company.styling, ...patch };
    companiesRef.current = companiesRef.current.map((c) => (c.id === id ? { ...c, styling } : c));
    setCompanies(companiesRef.current);
    setView((v) => (v && v.profile.id === id ? { ...v, ...patch, profile: { ...v.profile, styling } } : v));
    try {
      await updateCompanyStyling(id, styling);
    } catch (err) {
      failToast(err);
    }
  }, []);

  const updateProfile = useCallback(
    (p: Profile) => {
      const id = activeCompanyIdRef.current;
      return id ? updateCompany(id, p) : Promise.resolve();
    },
    [updateCompany]
  );

  const updateSettings = useCallback(
    (settings: Settings) => applyStyling({ settings }),
    [applyStyling]
  );
  const updateTemplate = useCallback(
    (template: TemplateCustomization) => applyStyling({ template }),
    [applyStyling]
  );

  /* ------------------------------------------------------------------ */
  /* Workspace CRUD — every change is persisted to Supabase first, then  */
  /* the local view is patched. Failures surface as toast notifications. */
  /* ------------------------------------------------------------------ */

  const upsertClient = useCallback(async (client: Client) => {
    const companyId = activeCompanyIdRef.current;
    if (!companyId) return;
    try {
      await upsertClientRow(companyId, client);
      setView((v) => {
        if (!v) return v;
        const exists = v.clients.some((c) => c.id === client.id);
        return {
          ...v,
          clients: exists ? v.clients.map((c) => (c.id === client.id ? client : c)) : [...v.clients, client],
        };
      });
    } catch (err) {
      failToast(err);
    }
  }, []);

  const deleteClient = useCallback(async (clientId: string) => {
    try {
      await deleteClientRow(clientId);
      setView((v) => (v ? { ...v, clients: v.clients.filter((c) => c.id !== clientId) } : v));
    } catch (err) {
      failToast(err);
    }
  }, []);

  const upsertInvoice = useCallback(async (invoice: Invoice) => {
    const companyId = activeCompanyIdRef.current;
    if (!companyId) return;
    try {
      await upsertInvoiceRow(companyId, invoice);
      setView((v) => {
        if (!v) return v;
        const exists = v.invoices.some((i) => i.id === invoice.id);
        return {
          ...v,
          invoices: exists ? v.invoices.map((i) => (i.id === invoice.id ? invoice : i)) : [...v.invoices, invoice],
        };
      });
    } catch (err) {
      failToast(err);
    }
  }, []);

  const deleteInvoice = useCallback(async (invoiceId: string) => {
    try {
      await deleteInvoiceRow(invoiceId);
      setView((v) => (v ? { ...v, invoices: v.invoices.filter((i) => i.id !== invoiceId) } : v));
    } catch (err) {
      failToast(err);
    }
  }, []);

  const upsertBankAccount = useCallback(async (account: BankAccount) => {
    const companyId = activeCompanyIdRef.current;
    if (!companyId) return;
    try {
      await upsertBankAccountRow(companyId, account);
      setView((v) => {
        if (!v) return v;
        const exists = v.bankAccounts.some((a) => a.id === account.id);
        return {
          ...v,
          bankAccounts: exists
            ? v.bankAccounts.map((a) => (a.id === account.id ? account : a))
            : [...v.bankAccounts, account],
        };
      });
    } catch (err) {
      failToast(err);
    }
  }, []);

  const deleteBankAccount = useCallback(async (accountId: string) => {
    try {
      await deleteBankAccountRow(accountId);
      setView((v) =>
        v
          ? {
              ...v,
              bankAccounts: v.bankAccounts.filter((a) => a.id !== accountId),
              invoices: v.invoices.map((i) => (i.bankAccountId === accountId ? { ...i, bankAccountId: "" } : i)),
            }
          : v
      );
    } catch (err) {
      failToast(err);
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /* Auth actions                                                        */
  /* ------------------------------------------------------------------ */

  const signOut = useCallback(async () => {
    setAuthReady(false);
    try {
      await signOutUser();
    } finally {
      resetAll();
      setAuthReady(true);
    }
  }, [resetAll]);

  const changePassword = useCallback(async (newPassword: string) => {
    await changeOwnPassword(newPassword);
    const me = profileRef.current;
    if (me) setProfile({ ...me, rawPassword: newPassword });
  }, []);

  /* ------------------------------------------------------------------ */
  /* Derived values                                                      */
  /* ------------------------------------------------------------------ */

  const activeCompany = view && activeCompanyId === view.profile.id ? view.profile : null;
  const isSuperAdmin = profile?.role === "super_admin";

  const data: CompanyView = view ?? FALLBACK_VIEW;

  const storage = useMemo<InvoiceAppData>(
    () => ({ companies, workspaces: view ? [{ ...view }] : [] }),
    [companies, view]
  );

  const value: InvoiceDataContextValue = {
    user,
    userProfile: profile,
    isSuperAdmin,
    authLoading: !authReady,
    signOut,
    changePassword,

    data,
    storage,
    companies,
    activeCompany,
    activeCompanyId,
    isLoading: workspaceLoading,
    needsOnboarding: authReady && !!user && !isSuperAdmin && companies.length === 0,

    setActiveCompany,
    addCompany,
    updateCompany,
    removeCompany,
    upsertClient,
    deleteClient,
    upsertInvoice,
    deleteInvoice,
    upsertBankAccount,
    deleteBankAccount,
    updateProfile,
    updateSettings,
    updateTemplate,
  };

  return <InvoiceDataContext.Provider value={value}>{children}</InvoiceDataContext.Provider>;
}

export function useInvoiceData(): InvoiceDataContextValue {
  const ctx = useContext(InvoiceDataContext);
  if (!ctx) throw new Error("useInvoiceData must be used within <InvoiceDataProvider>");
  return ctx;
}