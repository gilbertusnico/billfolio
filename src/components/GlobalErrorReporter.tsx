import { useEffect, useRef, useState } from "react";
import { AlertTriangle, RotateCcw, X } from "lucide-react";

/**
 * Catches runtime errors that React error boundaries cannot see — unhandled
 * promise rejections and window "error" events from async flows (effects,
 * event handlers, timers). Without this, those failures silently produce a
 * white screen with no explanation. This surfaces the message on-screen so
 * it can be diagnosed instead of guessed at.
 */
interface CapturedError {
  id: number;
  message: string;
  kind: "page" | "promise";
}

const MAX_ERRORS = 3;

function messageFrom(reason: unknown): string {
  if (reason instanceof Error) return reason.message || reason.name || "Unknown error";
  if (typeof reason === "string") return reason;
  if (reason && typeof reason === "object" && "message" in reason) return String((reason as { message: unknown }).message);
  return "Unknown error";
}

export default function GlobalErrorReporter() {
  const [errors, setErrors] = useState<CapturedError[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    const push = (kind: CapturedError["kind"], message: string) => {
      // Benign noise some browsers fire — ignore so users aren't bothered.
      if (/ResizeObserver|Script error\.?/.test(message)) return;
      idRef.current += 1;
      const id = idRef.current;
      setErrors((prev) => [...prev, { id, kind, message }].slice(-MAX_ERRORS));
    };

    const onError = (event: ErrorEvent) => {
      if (!event.message) return; // resource-load failures, not JS errors
      push("page", event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      push("promise", messageFrom(event.reason));
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (errors.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[999] flex flex-col items-center gap-2 px-4"
      aria-live="assertive"
    >
      {errors.map((err, index) => (
        <div
          key={err.id}
          role="alert"
          className="animate-toast-in pointer-events-auto w-full max-w-xl rounded-xl border border-rose-200 bg-white p-3 shadow-xl shadow-rose-900/10"
          style={{ opacity: 1 - index * 0.18 }}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100">
              <AlertTriangle className="h-4 w-4 text-rose-600" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-sm font-bold text-slate-900">
                {err.kind === "promise" ? "A background task failed" : "An unexpected error occurred"}
              </p>
              <p className="mt-1 line-clamp-2 overflow-hidden text-xs font-medium text-slate-500">
                {err.message || "No message supplied."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                title="Reload page"
                aria-label="Reload page"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-600 transition-all duration-150 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 active:scale-[0.95]"
              >
                <RotateCcw aria-hidden className="h-3.5 w-3.5" />
                Reload
              </button>
              <button
                type="button"
                onClick={() => setErrors((prev) => prev.filter((e) => e.id !== err.id))}
                title="Dismiss"
                aria-label="Dismiss error"
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-all duration-150 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 active:scale-[0.95]"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}