import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { ToastProvider } from "./components/Toast";
import GlobalErrorReporter from "./components/GlobalErrorReporter";
import { InvoiceDataProvider, useInvoiceData } from "./context/InvoiceDataContext";
import Layout from "./components/Layout";
import RequireAuth from "./guards/RequireAuth";
import { AdminGate } from "./guards/AdminGate";
import LoginPage from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Invoices from "./pages/Invoices";
import InvoiceBuilder from "./pages/InvoiceBuilder";
import Clients from "./pages/Clients";
import Settings from "./pages/Settings";
import AdminUsers from "./pages/admin/Users";
import AdminCompanies from "./pages/admin/Companies";

function FullScreenLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
      <LoaderCircle className="h-8 w-8 animate-spin text-blue-600" />
      <p className="text-sm font-medium text-slate-500">Loading BillFolio…</p>
    </div>
  );
}

function AuthError({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
        <AlertTriangle className="h-6 w-6 text-rose-600" />
      </span>
      <h1 className="mt-4 text-lg font-extrabold tracking-tight text-slate-900">Unable to connect</h1>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        BillFolio could not connect to Supabase. Check the project URL and your network connection.
      </p>
      <p className="mt-4 max-w-lg break-all rounded-lg bg-white px-4 py-3 text-left font-mono text-xs text-rose-600 shadow-sm ring-1 ring-slate-200">
        {message}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
      >
        <RotateCcw className="h-4 w-4" />
        Retry connection
      </button>
    </div>
  );
}

function AppRoutes() {
  const { authLoading, authError } = useInvoiceData();
  if (authLoading) return <FullScreenLoading />;
  if (authError) return <AuthError message={authError} />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <Navigate to="/" replace />
          </RequireAuth>
        }
      />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/new" element={<InvoiceBuilder />} />
        <Route path="/invoices/:id" element={<InvoiceBuilder />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/settings" element={<Settings />} />

        <Route
          path="/admin/users"
          element={
            <AdminGate>
              <AdminUsers />
            </AdminGate>
          }
        />
        <Route
          path="/admin/companies"
          element={
            <AdminGate>
              <AdminCompanies />
            </AdminGate>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("BillFolio render crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
            <AlertTriangle className="h-6 w-6 text-rose-600" />
          </span>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900">Something went wrong</h1>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              We hit an unexpected error while rendering this page. Reload to try again — if it keeps
              happening, the message below will help your admin fix it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 ease-out hover:bg-blue-700 active:scale-[0.97]"
          >
            <RotateCcw className="h-4 w-4" />
            Reload page
          </button>
          <details className="mt-2 w-full max-w-md rounded-xl border border-slate-200 bg-white p-3 text-left">
            <summary className="cursor-pointer text-xs font-semibold text-slate-500">Error details</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-rose-600">
              {this.state.error.message}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <AppErrorBoundary>
        <ToastProvider>
          <InvoiceDataProvider>
            <AppRoutes />
            <GlobalErrorReporter />
          </InvoiceDataProvider>
        </ToastProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  );
}