import { useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Building2, FileText, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Receipt, Settings, Users, X } from "lucide-react";
import CompanySwitcher from "./CompanySwitcher";
import { useInvoiceData } from "../context/InvoiceDataContext";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/invoices", label: "Invoices", icon: FileText, end: false },
  { to: "/clients", label: "Clients", icon: Users, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

const ADMIN_ITEMS = [
  { to: "/admin/users", label: "Team Users", icon: Users, end: false },
  { to: "/admin/companies", label: "Companies & Access", icon: Building2, end: false },
];

interface SidebarProps {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggle: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
}

function NavLinks({ items, onClose, collapsed }: { items: NavItem[]; onClose: () => void; collapsed: boolean }) {
  return (
    <>
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onClose}
          className={({ isActive }) =>
            `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-300 ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
              collapsed ? "lg:justify-center lg:px-2" : ""} ${
              isActive
                ? "bg-blue-600/15 font-semibold text-blue-300"
                : "font-medium text-slate-400 hover:translate-x-1 hover:bg-white/5 hover:text-slate-100"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full transition-all duration-300 ${
                  isActive ? "bg-blue-500" : "bg-transparent"
                }`}
              />
              <Icon className="h-5 w-5 shrink-0" strokeWidth={isActive ? 2.25 : 2} />
              <span
                className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-300 ease-in-out lg:block ${
                  collapsed
                    ? "lg:max-w-0 lg:-translate-x-2 lg:opacity-0"
                    : "lg:max-w-[180px] lg:translate-x-0 lg:opacity-100"
                }`}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </>
  );
}

export default function Sidebar({ open, collapsed, onClose, onToggle }: SidebarProps) {
  const { isSuperAdmin, userProfile, signOut } = useInvoiceData();
  const navigate = useNavigate();
  const asideRef = useRef<HTMLElement>(null);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus into the drawer and trap Tab cycling while open.
  useEffect(() => {
    if (!open) return;
    const node = asideRef.current;
    if (!node) return;
    const focusables = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea")
      ).filter((el) => el.offsetParent !== null);
    focusables()[0]?.focus();
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onTab);
    return () => node.removeEventListener("keydown", onTab);
  }, [open]);

  const handleSignOut = () => {
    onClose();
    void signOut().then(() => navigate("/login", { replace: true }));
  };

  return (
    <aside
      ref={asideRef}
      aria-label="Main navigation"
      aria-hidden={!open && !collapsed}
      className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-slate-950 text-slate-100 shadow-2xl transition-[width,transform] duration-300 ease-in-out print:hidden ${
        collapsed ? "lg:w-20" : "lg:w-72"
      } ${
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`}
    >
      <div className={`flex h-16 shrink-0 items-center gap-3 border-b border-white/10 ${collapsed ? "lg:justify-center lg:px-3" : "px-5"}`}>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 shadow-lg shadow-blue-600/40 ${
            collapsed ? "lg:hidden" : ""
          }`}
        >
          <Receipt className="h-5 w-5 text-white" />
        </div>
        <div
          className={`overflow-hidden whitespace-nowrap leading-tight transition-[max-width,opacity,transform] duration-300 ease-in-out ${
            collapsed
              ? "lg:max-w-0 lg:-translate-x-2 lg:opacity-0"
              : "lg:max-w-[180px] lg:translate-x-0 lg:opacity-100"
          }`}
        >
          <p className="text-[15px] font-bold tracking-tight text-white">BillFolio</p>
          <p className="text-[11px] font-medium text-slate-400">Simplify your billing</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="ml-auto rounded-md p-1.5 text-slate-400 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
          title={collapsed ? "Show sidebar" : "Hide sidebar"}
          className={`hidden rounded-md p-1.5 text-slate-400 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white lg:block ${collapsed ? "lg:absolute lg:left-1/2 lg:-translate-x-1/2" : "ml-auto"}`}
        >
          <PanelLeftOpen
            className={`absolute h-5 w-5 transition-all duration-300 ease-in-out ${
              collapsed ? "scale-100 rotate-0 opacity-100" : "scale-75 -rotate-90 opacity-0"
            }`}
          />
          <PanelLeftClose
            className={`h-5 w-5 transition-all duration-300 ease-in-out ${
              collapsed ? "scale-75 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
            }`}
          />
        </button>
      </div>

      <div
        className={`transition-[max-height,opacity] duration-300 ease-in-out ${
          collapsed ? "lg:max-h-0 lg:opacity-0" : "lg:max-h-60 lg:opacity-100"
        }`}
      >
        <CompanySwitcher onClose={onClose} />
      </div>

      <nav className={`flex-1 space-y-1 overflow-y-auto py-4 ${collapsed ? "px-3 lg:px-2" : "px-3"}`}>
        <NavLinks items={NAV_ITEMS} onClose={onClose} collapsed={collapsed} />

        {isSuperAdmin && (
          <>
            <p className={`flex items-center gap-2 px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-slate-500 ${collapsed ? "lg:justify-center" : ""}`}>
              <span aria-hidden className="h-1 w-1 rounded-full bg-violet-500" />
              <span
                className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-300 ease-in-out ${
                  collapsed
                    ? "lg:max-w-0 lg:-translate-x-2 lg:opacity-0"
                    : "lg:max-w-[180px] lg:translate-x-0 lg:opacity-100"
                }`}
              >
                Administration
              </span>
            </p>
            <NavLinks items={ADMIN_ITEMS} onClose={onClose} collapsed={collapsed} />
          </>
        )}
      </nav>

      {/* Account footer */}
      <div className={`shrink-0 border-t border-white/10 py-3 ${collapsed ? "px-3 lg:px-2" : "px-4"}`}>
        <div className={`flex items-center ${collapsed ? "" : "gap-3"}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-extrabold text-white">
            {(userProfile?.username ?? "?").charAt(0).toUpperCase()}
          </span>
          <div
            className={`min-w-0 flex-1 overflow-hidden whitespace-nowrap leading-tight transition-[max-width,opacity,transform] duration-300 ease-in-out ${
              collapsed
                ? "lg:max-w-0 lg:-translate-x-2 lg:opacity-0"
                : "lg:max-w-[180px] lg:translate-x-0 lg:opacity-100"
            }`}
          >
            <p className="truncate text-sm font-bold text-white">{userProfile?.username ?? "…"}</p>
            <p className="text-[11px] font-medium text-slate-400">
              {isSuperAdmin ? "Super Admin" : "Team member"}
            </p>
          </div>
          <button
            onClick={() => void handleSignOut()}
            aria-label="Sign out"
            title="Sign out"
            className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white active:scale-[0.92]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <p
          className={`mt-2.5 overflow-hidden whitespace-nowrap text-[11px] font-medium transition-[max-height,opacity,transform] duration-300 ease-in-out ${
            collapsed
              ? "lg:max-h-0 lg:-translate-y-2 lg:opacity-0"
              : "lg:max-h-8 lg:translate-y-0 lg:opacity-100"
          }`}
        >
          Cloud synced via Supabase · signed in as {userProfile?.username ?? "…"}
        </p>
      </div>
    </aside>
  );
}