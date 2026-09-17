import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, Check, Receipt, Sparkles } from "lucide-react";
import { useInvoiceData } from "../../context/InvoiceDataContext";
import { useToast } from "../../components/Toast";
import { friendlyError } from "../../lib/api";

const FIELD_CLASS =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

interface CompanyDraft {
  companyName: string;
  email: string;
  address: string;
  logoUrl: string;
}

export default function OnboardingPage() {
  const { addCompany, needsOnboarding, userProfile } = useInvoiceData();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<CompanyDraft>({ companyName: "", email: "", address: "", logoUrl: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Anyone who isn't mid-onboarding (super admins, users with companies) is redirected.
  if (!needsOnboarding && !done) return <Navigate to="/" replace />;

  const handleLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      if (url.length > 800_000) {
        showToast("Image too large — try one under ~800 KB", "error");
        return;
      }
      setDraft((d) => ({ ...d, logoUrl: url }));
    };
    reader.readAsDataURL(file);
  };

  const validate = (): boolean => {
    if (!draft.companyName.trim()) {
      setError("Give your company a name — e.g. “Acme Studio”.");
      return false;
    }
    if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) {
      setError("That email doesn't look right — check the format.");
      return false;
    }
    setError("");
    return true;
  };

  const nextStep = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setStep(2);
  };

  const finish = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setCreating(true);
    setError("");
    try {
      const company = await addCompany({
        companyName: draft.companyName.trim(),
        email: draft.email.trim(),
        address: draft.address.trim(),
        logoUrl: draft.logoUrl,
      });
      setDone(true);
      showToast(`${company.companyName} created — you're all set!`);
      window.setTimeout(() => navigate("/"), 350);
    } catch (err) {
      setError(friendlyError(err));
      showToast(friendlyError(err), "error");
      setCreating(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-6 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/40">
          <Receipt className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-base font-extrabold tracking-tight text-white">BillFolio</p>
          <p className="text-[11px] font-medium text-slate-400">Multi-tenant invoicing</p>
        </div>
        <span className="ml-auto rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300 ring-1 ring-white/10">
          {userProfile?.username ?? "New user"}
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          {/* Stepper */}
          <ol aria-label="Onboarding steps" className="mb-8 flex items-center gap-2">
            {[1, 2].map((s) => (
              <li key={s} className="flex flex-1 items-center gap-2">
                <span
                  aria-current={step === s ? "step" : undefined}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200 ${
                    step >= s ? "bg-blue-600 text-white" : "bg-white/10 text-slate-400"
                  }`}
                >
                  {step > s ? <Check className="h-4 w-4" /> : s}
                </span>
                <span className={`h-px flex-1 ${step > s ? "bg-blue-600" : "bg-white/10"}`} aria-hidden />
                <span className={`hidden text-xs font-semibold sm:block ${step >= s ? "text-slate-200" : "text-slate-500"}`}>
                  {s === 1 ? "Company" : "Finish"}
                </span>
              </li>
            ))}
          </ol>

          <div className="animate-scale-in rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
            {done ? (
              <div className="flex flex-col items-center py-6 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="h-7 w-7 text-emerald-600" strokeWidth={2.5} />
                </span>
                <h1 className="mt-4 text-xl font-extrabold tracking-tight text-slate-900">
                  You're in, {userProfile?.username ?? "friend"}!
                </h1>
                <p className="mt-1.5 text-sm text-slate-500">Taking you to your dashboard…</p>
              </div>
            ) : step === 1 ? (
              <form onSubmit={nextStep} noValidate>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
                    Let's set up your workspace
                  </h1>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Just a few details about your company — you can change them later in Settings.
                </p>

                <div className="mt-6 space-y-4">
                  <div>
                    <label htmlFor="oc-name" className="mb-1.5 block text-sm font-semibold text-slate-700">
                      Company name
                    </label>
                    <input
                      id="oc-name"
                      className={FIELD_CLASS}
                      value={draft.companyName}
                      onChange={(e) => setDraft((d) => ({ ...d, companyName: e.target.value }))}
                      placeholder="Acme Studio"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label htmlFor="oc-email" className="mb-1.5 block text-sm font-semibold text-slate-700">
                      Contact email <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input
                      id="oc-email"
                      type="email"
                      className={FIELD_CLASS}
                      value={draft.email}
                      onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                      placeholder="hello@acmestudio.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="oc-address" className="mb-1.5 block text-sm font-semibold text-slate-700">
                      Address <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <textarea
                      id="oc-address"
                      rows={2}
                      className={FIELD_CLASS}
                      value={draft.address}
                      onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                      placeholder="Jl. Sudirman No. 123, Jakarta"
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 block text-sm font-semibold text-slate-700">
                      Logo <span className="font-normal text-slate-400">(optional)</span>
                    </p>
                    <label className="cursor-pointer">
                      <span className="sr-only">Choose a logo image</span>
                      <input type="file" accept="image/*" className="sr-only" onChange={handleLogo} />
                      <span className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-all duration-150 ease-out hover:border-blue-400 hover:text-blue-600 active:scale-[0.97]">
                        <Building2 className="h-4 w-4" />
                        {draft.logoUrl ? "Change logo" : "Upload logo"}
                      </span>
                    </label>
                  </div>
                </div>

                {error && (
                  <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
                    {error}
                  </p>
                )}

                <div className="mt-6 flex items-center justify-between">
                  <button type="button" disabled className="cursor-not-allowed text-sm font-semibold text-slate-300">
                    Back
                  </button>
                  <button
                    type="submit"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-all duration-300 ease-out hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-[0.97]"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={finish} noValidate>
                <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
                  Everything look right?
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Confirm the details — you can always change them later in Settings.
                </p>

                <dl className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                      {draft.logoUrl ? (
                        <img src={draft.logoUrl} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <Building2 className="h-5 w-5 text-slate-300" />
                      )}
                    </span>
                    <dt className="sr-only">Company name</dt>
                    <dd className="font-bold text-slate-900">{draft.companyName}</dd>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email</dt>
                    <dd className="mt-0.5 text-slate-700">{draft.email || "—"}</dd>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Address</dt>
                    <dd className="mt-0.5 whitespace-pre-line text-slate-700">{draft.address || "—"}</dd>
                  </div>
                </dl>

                {error && (
                  <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
                    {error}
                  </p>
                )}

                <div className="mt-6 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-100 active:scale-[0.97]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-all duration-300 ease-out hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60"
                  >
                    {creating ? "Creating workspace…" : "Create Workspace"}
                  </button>
                </div>
              </form>
            )}
          </div>

          <p className="mt-5 text-center text-xs text-slate-500">
            Your data is stored securely in the cloud via Supabase — accessible from any device.
          </p>
        </div>
      </main>
    </div>
  );
}