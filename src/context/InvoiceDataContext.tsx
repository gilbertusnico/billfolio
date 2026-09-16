import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type {
  BankAccount,
  Client,
  Invoice,
  InvoiceAppData,
  Profile,
  Settings,
  TemplateCustomization,
} from "../types";
import {
  DEFAULT_DATA,
  deleteBankAccount as deleteBankAccountPure,
  deleteClient as deleteClientPure,
  deleteInvoice as deleteInvoicePure,
  initInvoiceData,
  saveInvoiceAppData,
  updateProfile as updateProfilePure,
  updateSettings as updateSettingsPure,
  updateTemplate as updateTemplatePure,
  upsertBankAccount as upsertBankAccountPure,
  upsertClient as upsertClientPure,
  upsertInvoice as upsertInvoicePure,
} from "../lib/storage";

interface InvoiceDataContextValue {
  data: InvoiceAppData;
  isLoading: boolean;
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

export function InvoiceDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ data: InvoiceAppData; isLoading: boolean }>({
    data: DEFAULT_DATA,
    isLoading: true,
  });

  // Rehydrate once from LocalStorage on mount.
  useEffect(() => {
    setState({ data: initInvoiceData(), isLoading: false });
  }, []);

  // Single write-through path: mutate → persist → re-render.
  const mutate = useCallback((fn: (data: InvoiceAppData) => InvoiceAppData) => {
    setState((prev) => {
      const next = fn(prev.data);
      saveInvoiceAppData(next);
      return { data: next, isLoading: false };
    });
  }, []);

  const value: InvoiceDataContextValue = {
    data: state.data,
    isLoading: state.isLoading,
    replaceData: useCallback((d: InvoiceAppData) => {
      saveInvoiceAppData(d);
      setState({ data: d, isLoading: false });
    }, []),
    upsertClient: useCallback((c: Client) => mutate((d) => upsertClientPure(d, c)), [mutate]),
    deleteClient: useCallback((id: string) => mutate((d) => deleteClientPure(d, id)), [mutate]),
    upsertInvoice: useCallback((i: Invoice) => mutate((d) => upsertInvoicePure(d, i)), [mutate]),
    deleteInvoice: useCallback((id: string) => mutate((d) => deleteInvoicePure(d, id)), [mutate]),
    upsertBankAccount: useCallback(
      (a: BankAccount) => mutate((d) => upsertBankAccountPure(d, a)),
      [mutate]
    ),
    deleteBankAccount: useCallback((id: string) => mutate((d) => deleteBankAccountPure(d, id)), [
      mutate,
    ]),
    updateProfile: useCallback((p: Profile) => mutate((d) => updateProfilePure(d, p)), [mutate]),
    updateSettings: useCallback((s: Settings) => mutate((d) => updateSettingsPure(d, s)), [
      mutate,
    ]),
    updateTemplate: useCallback((t: TemplateCustomization) => mutate((d) => updateTemplatePure(d, t)), [
      mutate,
    ]),
  };

  return <InvoiceDataContext.Provider value={value}>{children}</InvoiceDataContext.Provider>;
}

export function useInvoiceData(): InvoiceDataContextValue {
  const ctx = useContext(InvoiceDataContext);
  if (!ctx) throw new Error("useInvoiceData must be used within <InvoiceDataProvider>");
  return ctx;
}