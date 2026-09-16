import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
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

const ACTIVE_COMPANY_KEY = "invoice_app_active_company_id";

export type WorkspaceView = CompanyWorkspace & { profile: Company };

interface InvoiceDataContextValue {
  /* Auth */
  user: Session["user"] | null;
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
    styling: {
      settings: { ...DEFAULT_SETTINGS },
      template: structuredClone(DEFAULT_TEMPLATE),
    },
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
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [view, setView] = useState<WorkspaceView | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);

  // Refs so callbacks never read stale values.
  const sessionRef = useRef<Session | null>(null);
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
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const showError = (err: unknown) => {
    // Errors are surfaced to the caller; this hook is only a safety net for
    // fire-and-forget mutations (see each mutator below).
    console.error("[InvoiceData] ", err);
  };

  /* ------------------------------------------------------------------ */
  /* Loading a company's workspace                                       */
  /* ------------------------------------------------------------------ */

  const loadWorkspace = useCallback(async (companyId: string) => {
    const seq = ++loadSeq.current;
    setWorkspaceLoading(true);
    try {
      const company = companiesRef.current.find((c) => c.id === companyId);
      const payload = await fetchWorkspace(companyId);
      if (seq !== loadSeq.current) return; // a newer request superseded this one
      if (!company || companyId !== activeCompanyIdRef.current) return;
      setView({
        companyId,
        ...payload,
        settings: company.styling.settings,
        template: company.styling.template,
        profile: company,
      });
    } catch (err) {
      if (seq === loadSeq.current) showError(err);
    } finally {
      if (seq === loadSeq.current) setWorkspaceLoading(false);
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /* Bootstrap: session → profile → companies → active company           */
  /* ------------------------------------------------------------------ */

  const hydrateUser = useCallback(
    async (user: NonNullable<Session["user"]>) => {
      setSession((prev) => (prev?.user.id === user.id ? prev : ({ ...(prev ?? {}), user } as Session)));
      let prof = await fetchUserProfile(user.id).catch(() => null);
      if (!prof) {
        const fallbackName = (user.email ?? "user").split("@")[0] || "user";
        await ensureProfile(user.id, fallbackName).catch(() => undefined);
        prof = await fetchUserProfile(user.id).catch(() => null);
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
    setSession(null);
    setWorkspaceLoading(false);
  }, []);

  // Subscribe to auth changes (fires on mount for the current session too).
  useEffect(() => {
    let alive = true;

    const bootstrap = async () => {
      const {
        data: { session: current },
      } = await supabase.auth.getSession();
      if (!alive) return;
      if (current?.user) {
        await hydrateUser(current.user);
      } else {
        // Best-effort auto-seed of the Super Admin account (never auto-logs-in).
        await seedSuperAdmin().catch(() => undefined);
      }
      if (alive) setAuthReady(true);
    };
    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT" || event === "USER_DELETED") {
        resetAll();
        setAuthReady(true);
        return;
      }
      if (nextSession?.user) {
        setSession(nextSession);
        void hydrateUser(nextSession.user);
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
  /* Company + workspace mutations                                       */
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
        ? { ...c, companyName: p.companyName, email: p.email, address: p.address, logoUrl: p.logoUrl, updatedAt: new Date().toISOString() }
        : c
    );
    setCompanies(companiesRef.current);
    setView((v) => (v && v.profile.id === id ? { ...v, profile: companiesRef.current.find((c) => c.id === id)! } : v));
  }, []);

  const removeCompany = useCallback(
    async (id: string) => {
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
    },
    [loadWorkspace]
  );

  const applyStyling = useCallback(async (patch: Partial<CompanyStyling>) => {
    const id = activeCompanyIdRef.current;
    if (!id) return;
    const company = companiesRef.current.find((c) => c.id === id);
    if (!company) return;
    const styling: CompanyStyling = { ...company.styling, ...patch };
    companiesRef.current = companiesRef.current.map((c) => (c.id === id ? { ...c, styling } : c));
    setCompanies(companiesRef.current);
    setView((v) =>
      v && v.profile.id === id
        ? { ...v, ...patch, profile: { ...v.profile, styling } }
        : v
    );
    await updateCompanyStyling(id, styling);
  }, []);

  const updateProfile = useCallback(
    (p: Profile) => {
      const id = activeCompanyIdRef.current;
      if (id) return updateCompany(id, p);
      return Promise.resolve();
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

  /** Applies a workspace mutator to both the DB and the local view. */
  const mutateView = useCallback(
    (fn: (v: WorkspaceView) => WorkspaceView) => {
      setView((v) => (v ? fn(v) : v));
      if (!v) return; // note: `v` is the previous value read below
    },
    []
  );

  /* ------------------------------------------------------------------ */
  /* Fire-and-forget workspace CRUD (toasts on failure are handled by    */
  /* the call pages via catch → error toast)                             */
  /* ------------------------------------------------------------------ */

  const upsertClient = useCallback(async (client: Client) => {
    const companyId = activeCompanyIdRef.current;
    if (!companyId) return;
    await upsertClientRow(companyId, client);
    setView((v) => {
      if (!v) return v;
      const exists = v.clients.some((c) => c.id === client.id);
      return {
        ...v,
        clients: exists ? v.clients.map((c) => (c.id === client.id ? client : c)) : [...v.clients, client],
      };
    });
  }, []);

  const deleteClient = useCallback(async (clientId: string) => {
    await deleteClientRow(clientId);
    setView((v) => (v ? { ...v, clients: v.clients.filter((c) => c.id !== clientId) } : v));
  }, []);

  const upsertInvoice = useCallback(async (invoice: Invoice) => {
    const companyId = activeCompanyIdRef.current;
    if (!companyId) return;
    await upsertInvoiceRow(companyId, invoice);
    setView((v) => {
      if (!v) return v;
      const exists = v.invoices.some((i) => i.id === invoice.id);
      return {
        ...v,
        invoices: exists ? v.invoices.map((i) => (i.id === invoice.id ? invoice : i)) : [...v.invoices, invoice],
      };
    });
  }, []);

  const deleteInvoice = useCallback(async (invoiceId: string) => {
    await deleteInvoiceRow(invoiceId);
    setView((v) => (v ? { ...v, invoices: v.invoices.filter((i) => i.id !== invoiceId) } : v));
  }, []);

  const upsertBankAccount = useCallback(async (account: BankAccount) => {
    const companyId = activeCompanyIdRef.current;
    if (!companyId) return;
    await upsertBankAccountRow(companyId, account);
    setView((v) => {
      if (!v) return v;
      const exists = v.bankAccounts.some((a) => a.id === account.id);
      return {
        ...v,
        bankAccounts: exists ? v.bankAccounts.map((a) => (a.id === account.id ? account : a)) : [...v.bankAccounts, account],
      };
    });
  }, []);

  const deleteBankAccount = useCallback(async (accountId: string) => {
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

  const changePassword = useCallback(
    async (newPassword: string) => {
      await changeOwnPassword(newPassword);
      const me = profileRef.current;
      if (me) setProfile({ ...me, rawPassword: newPassword });
    },
    []
  );

  /* ------------------------------------------------------------------ */
  /* Derived values                                                      */
  /* ------------------------------------------------------------------ */

  const activeCompany = view?.profile && activeCompanyId === view.profile.id ? view.profile : null;
  const isSuperAdmin = profile?.role === "super_admin";

  const data: CompanyView = view ?? FALLBACK_VIEW;

  const storage = useMemo<InvoiceAppData>(
    () => ({
      companies,
      workspaces: view ? [{ ...view }] : [],
    }),
    [companies, view]
  );

  const value: InvoiceDataContextValue = {
    user: session?.user ?? null,
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
    needsOnboarding: authReady && !!session?.user && !isSuperAdmin && companies.length === 0,

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

// Re-exported for pages that want the friendly error text.
export { friendlyError };