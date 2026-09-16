import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { FileText, LayoutDashboard, Receipt, Settings, Users, X } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/invoices", label: "Invoices", icon: FileText, end: false },
  { to: "/clients", label: "Clients", icon: Users, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
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
        node.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea')
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

  return (
    <aside
      ref={asideRef}
      aria-label="Main navigation"
      aria-hidden={!open}
      className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-950 text-slate-100 shadow-2xl transition-transform duration-300 ease-in-out print:hidden ${
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`}
    >
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 shadow-lg shadow-blue-600/40">
          <Receipt className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
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
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-300 ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
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
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 px-5 py-4 text-[11px] font-medium leading-relaxed text-slate-500">
        Local-first · your data stays in this browser.
      </div>
    </aside>
  );
}