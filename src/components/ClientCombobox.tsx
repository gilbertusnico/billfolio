import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, ChevronDown, Search, UserRound, X } from "lucide-react";
import type { Client } from "../types";

interface ClientComboboxProps {
  clients: Client[];
  value: string | null;
  onChange: (id: string | null) => void;
  id: string;
}

/**
 * ARIA combobox + listbox pattern: ArrowUp/Down to move, Enter to select,
 * Escape to close. Search filters the list live.
 */
export default function ClientCombobox({ clients, value, onChange, id }: ClientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const comboboxRef = useRef<HTMLInputElement>(null);
  const listId = `${id}-listbox`;

  const selected = clients.find((c) => c.id === value) ?? null;
  const filtered = clients.filter((c) =>
    `${c.name} ${c.company ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  // Close on outside click + Escape; focus the search on open.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => comboboxRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openList = () => {
    setOpen(true);
    setQuery("");
    setHighlight(0);
  };

  const selectOption = (client: Client) => {
    onChange(client.id);
    setOpen(false);
    setHighlight(0);
  };

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[highlight];
      if (option) selectOption(option);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      {selected && !open ? (
        <div className="input flex cursor-pointer items-center justify-between gap-2 pr-2 hover:border-slate-300">
          <span className="flex min-w-0 items-center gap-2">
            <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate font-medium text-slate-800">
              {selected.name}
              {selected.company ? (
                <span className="font-normal text-slate-500"> · {selected.company}</span>
              ) : null}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label={`Clear selection ${selected.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="cursor-pointer rounded-md p-1 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Change client"
              onClick={openList}
              className="cursor-pointer rounded-md p-1 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-600"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={openList}
          className="input flex cursor-pointer items-center justify-between gap-2 text-left"
        >
          <span className="flex min-w-0 items-center gap-2 text-slate-400">
            <UserRound className="h-4 w-4 shrink-0" />
            Select a client…
          </span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </button>
      )}

      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={comboboxRef}
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={
                  filtered[highlight] ? `${id}-opt-${filtered[highlight].id}` : undefined
                }
                aria-label="Search clients"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlight(0);
                }}
                onKeyDown={onSearchKeyDown}
                className="input py-2 pl-9"
                placeholder="Search clients…"
              />
            </div>
          </div>
          <ul role="listbox" id={listId} className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-slate-500">
                No clients found — try a different search.
              </li>
            ) : (
              filtered.map((c, i) => {
                const isSelected = c.id === value;
                const isActive = i === highlight;
                return (
                  <li
                    key={c.id}
                    id={`${id}-opt-${c.id}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectOption(c);
                    }}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors duration-150 ${
                      isActive ? "bg-blue-50" : ""
                    }`}
                  >
                    <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="w-full truncate font-semibold text-slate-800">
                  {c.name}
                  {c.company ? (
                    <span className="font-normal text-slate-500"> · {c.company}</span>
                  ) : null}
                </span>
                {isSelected && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}