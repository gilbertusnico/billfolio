import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

const BASE_CLASS =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  /** Extra classes appended to the input (e.g. `pl-10` when a leading icon is used). */
  className?: string;
}

/**
 * Password field with a show/hide (eye) toggle on the right edge.
 * Always renders `type="password"` until the user opts in to viewing it.
 */
export default function PasswordInput({ className = "", ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`${BASE_CLASS} pr-11 ${className}`.trim()}
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors duration-150 ease-out hover:bg-slate-100 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 active:scale-[0.92]"
      >
        {visible ? (
          <EyeOff aria-hidden className="h-4.5 w-4.5" />
        ) : (
          <Eye aria-hidden className="h-4.5 w-4.5" />
        )}
      </button>
    </div>
  );
}