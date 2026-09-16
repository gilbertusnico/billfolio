import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu, Plus } from "lucide-react";
import Sidebar from "./Sidebar";
import { ButtonLink } from "./Button";
import { useInvoiceData } from "../context/InvoiceDataContext";

function pageTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname === "/invoices") return "Invoices";
  if (pathname === "/invoices/new") return "New Invoice";
  if (pathname.startsWith("/invoices/")) return "Edit Invoice";
  if (pathname === "/clients") return "Clients";
  if (pathname === "/settings") return "Settings";
  return "BillFolio";
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const { activeCompanyId } = useInvoiceData();
  const showNewInvoice = pathname === "/" || pathname === "/invoices";

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Scrim behind the mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] lg:hidden print:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <div className="flex min-h-screen flex-col lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-slate-50/90 backdrop-blur print:hidden">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition-all duration-200 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-[0.97] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              {pageTitle(pathname)}
            </h1>
            <div className="ml-auto flex items-center gap-3">
              {showNewInvoice && (
                <ButtonLink to="/invoices/new">
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                  New Invoice
                </ButtonLink>
              )}
            </div>
          </div>
        </header>

        <main
          key={`${pathname}:${activeCompanyId ?? ""}`}
          className="animate-fade-in mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}