import { isLightColor } from "../lib/color";
import { formatDate, formatIDR } from "../lib/format";
import { itemAmount } from "../lib/invoice";
import type {
  BankSnapshot,
  ClientSnapshot,
  InvoiceItem,
  Profile,
  TemplateCustomization,
  TemplateBorder,
} from "../types";

interface InvoicePreviewProps {
  number: string;
  invoiceDate: string;
  dueDate: string;
  projectName: string;
  client: ClientSnapshot | null;
  items: InvoiceItem[];
  taxRate: number;
  discount: number;
  bank: BankSnapshot | null;
  notes: string;
  profile: Profile;
  template: TemplateCustomization;
}

/**
 * Decorative full-width bar pinned to the very top/bottom edge of the document.
 * Uses print-color-adjust: exact so the bar still prints when the browser's
 * "background graphics" option is disabled.
 */
function EdgeBar({ border, position }: { border: TemplateBorder; position: "top" | "bottom" }) {
  if (!border.visible) return null;
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute left-0 right-0 ${position === "top" ? "top-0" : "bottom-0"}`}
      style={{
        height: border.thickness,
        backgroundColor: border.color,
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    />
  );
}

/** Pure document renderer — mirrored live by the builder and printed via print CSS. */
export default function InvoicePreview({
  number,
  invoiceDate,
  dueDate,
  projectName,
  client,
  items,
  taxRate,
  discount,
  bank,
  notes,
  profile,
  template,
}: InvoicePreviewProps) {
  const rows = items.filter((i) => i.description.trim() !== "" || Number(i.quantity) > 0);
  const subtotal = rows.reduce((sum, i) => sum + itemAmount(i), 0);
  const tax = (subtotal * (Number(taxRate) || 0)) / 100;
  const discountAmount = Number(discount) || 0;
  const total = subtotal - discountAmount + tax;

  const { headerStyle, headerColor, zebra } = template.table;
  // Keep header labels readable no matter which background the user picks.
  const headerTextColor = isLightColor(headerColor) ? "#334155" : "#ffffff";

  const companyName = profile.companyName || "Your Company";
  const initial = companyName.trim().charAt(0).toUpperCase() || "I";

  return (
    <div className="invoice-paper relative overflow-hidden rounded-2xl px-8 py-10 text-slate-800 shadow-xl ring-1 ring-slate-200 sm:px-10">
      <EdgeBar border={template.topBorder} position="top" />
      <EdgeBar border={template.bottomBorder} position="bottom" />

      {/* Header: logo/company + INVOICE meta */}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          {profile.logoUrl ? (
            <img
              src={profile.logoUrl}
              alt=""
              className="h-14 w-14 rounded-xl object-contain ring-1 ring-slate-200"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 text-2xl font-extrabold text-white">
              {initial}
            </div>
          )}
        </div>
        <div className="text-right">
          <p
            className="text-2xl font-extrabold uppercase tracking-tight"
            style={{ color: template.invoiceTitleColor }}
          >
            Invoice
          </p>
          <p className="mt-1 text-sm font-bold text-slate-700">{number || "\u00A0INV-\u00A0"}</p>
          <p className="mt-2 text-xs text-slate-500">
            Invoice date: <span className="font-semibold text-slate-700">{formatDate(invoiceDate)}</span>
          </p>
          <p className="text-xs text-slate-500">
            Due date: <span className="font-semibold text-slate-700">{formatDate(dueDate)}</span>
          </p>
          {projectName && (
            <p className="mt-2 text-xs font-semibold text-slate-600">{projectName}</p>
          )}
        </div>
      </div>

      {/* Bill to / from */}
      <div className="mt-8 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Bill To
          </p>
          {client ? (
            <>
              <p className="mt-1 text-sm font-bold text-slate-900">{client.name}</p>
              {client.company && <p className="text-xs text-slate-600">{client.company}</p>}
              {client.email && <p className="text-xs text-slate-500">{client.email}</p>}
              {client.phone && <p className="text-xs text-slate-500">{client.phone}</p>}
              {client.address && (
                <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-slate-500">
                  {client.address}
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-400">Select a client to display here</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">From</p>
          <p className="mt-1 text-sm font-bold" style={{ color: template.companyNameColor }}>
            {companyName}
          </p>
          {profile.email && <p className="text-xs text-slate-500">{profile.email}</p>}
          {profile.address && (
            <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-slate-500">
              {profile.address}
            </p>
          )}
        </div>
      </div>

      {/* Line items — keeps its min-width and scrolls horizontally on narrow
          screens so the Qty / Unit Price / Amount columns are never clipped
          (print ignores the scroll and lays out full width). */}
      <div className="mt-8 overflow-x-auto overflow-y-hidden rounded-xl border border-slate-200 print:overflow-visible">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr
              className="text-left text-[11px] uppercase tracking-wider"
              style={{
                color: headerTextColor,
                // "filled" → soft background tint; "minimal" → a single line under the header.
                backgroundColor: headerStyle === "filled" ? headerColor : undefined,
                borderBottom: headerStyle === "minimal" ? "2px solid #cbd5e1" : undefined,
                printColorAdjust: headerStyle === "filled" ? "exact" : undefined,
                WebkitPrintColorAdjust: headerStyle === "filled" ? "exact" : undefined,
              }}
            >
              <th scope="col" className="px-4 py-2.5 font-bold">Description</th>
              <th scope="col" className="px-4 py-2.5 text-center font-bold">Qty</th>
              <th scope="col" className="px-4 py-2.5 text-right font-bold">Unit Price</th>
              <th scope="col" className="px-4 py-2.5 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-xs text-slate-400">
                  Add line items on the left — they appear here instantly.
                </td>
              </tr>
            ) : (
              rows.map((item, index) => {
                const striped = zebra && index % 2 === 1;
                return (
                  <tr
                    key={item.id}
                    className={`border-t border-slate-100 ${striped ? "bg-slate-50" : ""}`}
                    style={
                      striped
                        ? { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }
                        : undefined
                    }
                  >
                    <td className="px-4 py-2.5 text-slate-700">{item.description || "—"}</td>
                    <td className="px-4 py-2.5 text-center text-slate-600">
                      {Number(item.quantity) || 0}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      {formatIDR(Number(item.unitPrice) || 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-900">
                      {formatIDR(itemAmount(item))}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

        {/* Totals — optional subtotal, discount, and tax rows stay out of the document when unused. */}
      <div className="mt-6 flex justify-end">
        <dl className="w-full max-w-[240px] space-y-1.5 text-sm">
          {(Number(taxRate) || 0) > 0 || discountAmount > 0 ? (
            <>
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="font-semibold text-slate-700">{formatIDR(subtotal)}</dd>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Discount</dt>
                  <dd className="font-semibold text-rose-600">-{formatIDR(discountAmount)}</dd>
                </div>
              )}
              {(Number(taxRate) || 0) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Tax ({(Number(taxRate) || 0)}%)</dt>
                  <dd className="font-semibold text-slate-700">{formatIDR(tax)}</dd>
                </div>
              )}
            </>
          ) : null}
          <div
            className={`flex justify-between pt-2 ${
              (Number(taxRate) || 0) > 0 || discountAmount > 0
                ? "border-t border-slate-200"
                : ""
            }`}
          >
            <dt className="font-bold text-slate-900">Grand Total</dt>
            <dd className="text-lg font-extrabold tracking-tight text-slate-900">
              {formatIDR(total)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Payment + notes */}
      <div className="mt-8 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Payment Details
          </p>
          {bank ? (
            <>
              <p className="mt-1 text-sm font-bold text-slate-900">{bank.name}</p>
              <p className="text-xs text-slate-600">{bank.holder}</p>
              <p className="mt-0.5 text-sm font-semibold tracking-wide text-slate-800">
                {bank.accountNumber}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-400">No bank account selected</p>
          )}
        </div>
        {notes && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Notes</p>
            <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600">
              {notes}
            </p>
          </div>
        )}
      </div>

      <div className="mt-10 border-t border-slate-100 pt-4 text-center text-[11px] text-slate-400">
        {companyName} — Terima kasih atas kerja sama Anda.
      </div>
    </div>
  );
}