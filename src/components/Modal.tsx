import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}

/**
 * Accessible modal: role=dialog + aria-modal, focus trap, Escape to close,
 * focus moves to first focusable on open and returns to the trigger on close.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = "max-w-md",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // Keep onClose in a ref so the focus-trap effect only re-runs when `open`
  // changes — an inline onClose from a parent would otherwise re-steal focus
  // on every re-render (e.g. each keystroke in a controlled input).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const dialog = dialogRef.current;
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null);

    const first = focusables()[0];
    (first ?? dialog)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === "Tab") {
        const list = focusables();
        if (list.length === 0) return;
        const [firstEl, lastEl] = [list[0], list[list.length - 1]];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  // Render via a portal to document.body: any ancestor with a transform,
  // filter or animation fill (e.g. main's animate-fade-in) would otherwise
  // become the containing block for `position: fixed` and the modal would no
  // longer center on the viewport.
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 print:hidden">
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={`animate-scale-in relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto ${maxWidth} rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200 sm:p-6`}
      >
        <h2 id="modal-title" className="text-lg font-bold tracking-tight text-slate-900">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}