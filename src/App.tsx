import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { InvoiceDataProvider } from "./context/InvoiceDataContext";
import { ToastProvider } from "./components/Toast";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Invoices from "./pages/Invoices";
import InvoiceBuilder from "./pages/InvoiceBuilder";
import Clients from "./pages/Clients";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <InvoiceDataProvider>
        <ToastProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/invoices/new" element={<InvoiceBuilder />} />
              <Route path="/invoices/:id" element={<InvoiceBuilder />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ToastProvider>
      </InvoiceDataProvider>
    </BrowserRouter>
  );
}