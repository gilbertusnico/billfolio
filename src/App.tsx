import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { ToastProvider } from "./components/Toast";
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
import OnboardingPage from "./pages/admin/Onboarding";
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

function AppRoutes() {
  const { authLoading } = useInvoiceData();
  if (authLoading) return <FullScreenLoading />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
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

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <InvoiceDataProvider>
          <AppRoutes />
        </InvoiceDataProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}