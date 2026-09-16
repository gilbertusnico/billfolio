import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useInvoiceData } from "../context/InvoiceDataContext";
import CompanyModal from "./CompanyModal";
import type { CompanyInput } from "./CompanyModal";
import { useToast } from "./Toast";
import type { Company } from "../types";

function CompanyAvatar({ company, size = "md" }: { company: Company; size?: "md" | "sm" }) {
  const dims = size === "md" ? "h-9 w-9 rounded-lg" : "h-7 w-7 rounded-md";
  const initial = (company.companyName || "?").trim().charAt(0).toUpperCase();
  if (company.logoUrl) {
    return (
      <img
        src={company.logoUrl}
        alt=""
        className={`${dims} shrink-0 border border-white/10 bg-white/10 object-contain p-0.5`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${dims} flex shrink-0 items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-extrabold text-white`}
    >
      {initial}
    </span>
  );
}

interface CompanySwitcherProps {
  /** Close the sidebar drawer after a selection (mobile). */
  onClose?: () => void;
}

export default function CompanySwitcher({ onClose }: CompanySwitcherProps) {
  const { companies, activeCompany, setActiveCompany, addCompany } = useInvoiceData();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape while open; focus the first item on open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Arrow-key navigation between menu items.
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next].focus();
  };

  const selectCompany = (id: string) => {
    setActiveCompany(id);
    setOpen(false);
    onClose?.();
  };

  const handleAdd = (input: CompanyInput) => {
    const company = addCompany(input);
    showToast(`${company.companyName || "Company"} created — it's now active`);
    setModalOpen(false);
    setOpen(false);
    onClose?.();
  };

  const fallbackCompany: Company = {
    id: "",
    companyName: "My Company",
    email: "",
    address: "",
    logoUrl: "",
    createdAt: "",
    updatedAt: "",
  };

  return (
    <div ref={wrapRef} className="relative shrink-0 border-b border-white/10 px-3 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors duration-200 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400"
      >
        <CompanyAvatar company={activeCompany ?? fallbackCompany} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-bold text-white">
            {activeCompany?.companyName || "My Company"}
          </span>
          <span className="block text-[11px] font-medium text-slate-400">Switch workspace</span>
        </span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Companies"
          onKeyDown={onMenuKeyDown}
          className="animate-fade-in absolute inset-x-3 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl ring-1 ring-black/40"
        >
          <div className="max-h-64 overflow-y-auto py-1.5">
            {companies.map((c) => {
              const isActive = c.id === activeCompany?.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="menuitem"
                  aria-current={isActive}
                  onClick={() => selectCompany(c.id)}
                  className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
                >
                  <CompanyAvatar company={c} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-200">
                    {c.companyName || "Untitled company"}
                  </span>
                  {isActive && (
                    <Check className="h-4 w-4 shrink-0 text-blue-400" strokeWidth={2.5} />
                  )}
                </button>
              );
            })}
          </div>
          <div className="border-t border-white/10 p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => setModalOpen(true)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-blue-300 transition-colors duration-150 hover:bg-blue-500/10 focus-visible:bg-blue-500/10 focus-visible:outline-none"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Add New Company
            </button>
          </div>
        </div>
      )}

      <CompanyModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleAdd} />
    </div>
  );
}