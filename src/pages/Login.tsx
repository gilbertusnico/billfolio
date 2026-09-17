import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, FileText, Lock, Receipt, ShieldCheck, User, Users } from "lucide-react";
import { useInvoiceData } from "../context/InvoiceDataContext";
import { useToast } from "../components/Toast";
import { signInWithUsername } from "../lib/api";

const FIELD_CLASS =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

const FEATURES = [
  { icon: FileText, text: "Beautiful invoices, printed & emailed in seconds" },
  { icon: Users, text: "Share workspaces with your whole team" },
  { icon: ShieldCheck, text: "Role-based access — admins control who sees what" },
];

export default function LoginPage() {
  const { user } = useInvoiceData();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Already signed in → skip the login screen.
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { data, error: signInError } = await signInWithUsername(username.trim(), password);
      if (signInError || !data.user) {
        setError("That username or password doesn't match — try again.");
        showToast("Sign-in failed — check your username and password", "error");
        return;
      }
      showToast(`Welcome back, ${username.trim()}!`);
      navigate(location.state?.from ?? "/", { replace: true });
    } catch {
      setError("We couldn't reach the server — check your connection and try again.");
      showToast("Network error — we couldn't reach the server", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-slate-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-blue-600/30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/40">
            <Receipt className="h-6 w-6 text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-lg font-extrabold tracking-tight text-white">BillFolio</p>
            <p className="text-xs font-medium text-slate-400">Multi-tenant invoicing</p>
          </div>
        </div>

        <div className="relative">
          <h2 className="max-w-md text-3xl font-extrabold leading-tight tracking-tight text-white">
            Invoices for every team,<br />
            <span className="text-blue-400">one secure account.</span>
          </h2>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm font-medium text-slate-300">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
                  <Icon className="h-4.5 w-4.5 text-blue-400" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

      </aside>

      {/* Form panel */}
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/40">
              <Receipt className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-base font-extrabold tracking-tight text-slate-900">BillFolio</p>
              <p className="text-[11px] font-medium text-slate-500">Simplify your billing</p>
            </div>
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in with your BillFolio username to continue.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="username" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Username
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="username"
                  name="username"
                  autoComplete="username"
                  className={`${FIELD_CLASS} pl-10`}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. nico"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className={`${FIELD_CLASS} pl-10 pr-11`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-all duration-300 ease-out hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Ask your workspace admin for credentials — usernames are shared across the team.
          </p>
        </div>
      </main>
    </div>
  );
}