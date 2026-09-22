import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { Banknote, ImagePlus, Landmark, LogOut, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { useInvoiceData } from "../context/InvoiceDataContext";
import { useToast } from "../components/Toast";
import Button from "../components/Button";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import PasswordInput from "../components/PasswordInput";
import type { BankAccount } from "../types";

interface ProfileDraft {
  companyName: string;
  email: string;
  address: string;
  logoUrl: string;
}

interface BankDraft {
  name: string;
  accountNumber: string;
  holder: string;
}

const EMPTY_BANK: BankDraft = { name: "", accountNumber: "", holder: "" };

const FIELD_CLASS =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="animate-fade-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 pb-4 pt-5 sm:px-6">
        <h2 className="font-bold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

export default function Settings() {
  const {
    data,
    isLoading,
    updateProfile,
    upsertBankAccount,
    deleteBankAccount,
    userProfile,
    isSuperAdmin,
    changePassword,
    signOut,
  } = useInvoiceData();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<ProfileDraft>({
    companyName: data.profile.companyName,
    email: data.profile.email,
    address: data.profile.address,
    logoUrl: data.profile.logoUrl,
  });
  const [bankModal, setBankModal] = useState(false);
  const [bankEditingId, setBankEditingId] = useState<string | null>(null);
  const [bankForm, setBankForm] = useState<BankDraft>(EMPTY_BANK);
  const [bankError, setBankError] = useState("");
  const [deletingBank, setDeletingBank] = useState<BankAccount | null>(null);

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  // Keep the profile draft in sync when the active company changes.
  useEffect(() => {
    setProfile({
      companyName: data.profile.companyName,
      email: data.profile.email,
      address: data.profile.address,
      logoUrl: data.profile.logoUrl,
    });
  }, [data.profile]);

  /* ---------------- Profile ---------------- */

  const handleSaveProfile = () => {
    updateProfile({
      companyName: profile.companyName.trim(),
      email: profile.email.trim(),
      address: profile.address.trim(),
      logoUrl: profile.logoUrl,
    });
    showToast("Profile Saved");
  };

  const onLogoFile = (e: ChangeEvent<HTMLInputElement>) => {
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
      setProfile((p) => ({ ...p, logoUrl: url }));
      showToast("Logo added — don't forget to save");
    };
    reader.readAsDataURL(file);
  };

  /* ---------------- Bank accounts ---------------- */

  const openAddBank = () => {
    setBankEditingId(null);
    setBankForm(EMPTY_BANK);
    setBankError("");
    setBankModal(true);
  };

  const openEditBank = (account: BankAccount) => {
    setBankEditingId(account.id);
    setBankForm({
      name: account.name,
      accountNumber: account.accountNumber.replace(/\s/g, ""),
      holder: account.holder,
    });
    setBankError("");
    setBankModal(true);
  };

  const handleSaveBank = () => {
    const name = bankForm.name.trim();
    const holder = bankForm.holder.trim();
    const digits = bankForm.accountNumber.trim().replace(/[\s-]/g, "");
    if (!name) {
      setBankError("Enter the bank name.");
      return;
    }
    if (!holder) {
      setBankError("Enter the account holder's name.");
      return;
    }
    if (!/^\d{6,20}$/.test(digits)) {
      setBankError("Account number must be 6–20 digits.");
      return;
    }
    const accountNumber = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
    if (bankEditingId) {
      upsertBankAccount({
        id: bankEditingId,
        name,
        accountNumber,
        holder,
      });
      showToast("Bank Account Updated");
    } else {
      upsertBankAccount({
        id: crypto.randomUUID(),
        name,
        accountNumber,
        holder,
      });
      showToast("Bank Account Added");
    }
    setBankModal(false);
  };

  const confirmDeleteBank = () => {
    if (!deletingBank) return;
    deleteBankAccount(deletingBank.id);
    showToast("Bank Account Deleted");
    setDeletingBank(null);
  };

  /* ---------------- Account & password ---------------- */

  const handleChangePassword = async () => {
    if (!newPassword) {
      setPwError("Enter a new password.");
      return;
    }
    if (newPassword.length < 12) {
      setPwError("Password must be at least 12 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("The two passwords don't match.");
      return;
    }
    setPwSaving(true);
    setPwError("");
    try {
      await changePassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      showToast("Password updated — use it next time you sign in");
    } catch {
      setPwError("We couldn't update your password — try again.");
    } finally {
      setPwSaving(false);
    }
  };

  const bankUsedCount = (id: string) => data.invoices.filter((i) => i.bankAccountId === id).length;

  return (
    <div className="space-y-6">
      {/* Company profile */}
      <Panel
        title="Business Profile"
        description={`Business profile for ${
          data.profile.companyName || "this company"
        } — shown on your invoices alongside your logo.`}
      >
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-16 w-16 animate-pulse rounded-xl bg-slate-200" />
            <div className="h-10 animate-pulse rounded-xl bg-slate-200" />
            <div className="h-10 animate-pulse rounded-xl bg-slate-200" />
            <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {profile.logoUrl ? (
                  <img src={profile.logoUrl} alt="Company logo" className="h-full w-full object-contain" />
                ) : (
                  <Landmark className="h-7 w-7 text-slate-300" />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer">
                  <span className="sr-only">Choose a logo image</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={onLogoFile} />
                  <span className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-all duration-150 ease-out hover:border-blue-400 hover:text-blue-600 active:scale-[0.97]">
                    <ImagePlus className="h-4 w-4" />
                    {profile.logoUrl ? "Change Logo" : "Upload Logo"}
                  </span>
                </label>
                {profile.logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setProfile((p) => ({ ...p, logoUrl: "" }))}
                  >
                    <X className="h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400">
              JPG/PNG under ~800 KB. The logo appears on the printed invoice.
            </p>

            <div>
              <label htmlFor="company-name" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Company name
              </label>
              <input
                id="company-name"
                className={FIELD_CLASS}
                value={profile.companyName}
                onChange={(e) => setProfile((p) => ({ ...p, companyName: e.target.value }))}
                placeholder="Acme Studio"
              />
            </div>

            <div>
              <label htmlFor="company-email" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Email
              </label>
              <input
                id="company-email"
                type="email"
                className={FIELD_CLASS}
                value={profile.email}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                placeholder="hello@acmestudio.com"
              />
            </div>

            <div>
              <label htmlFor="company-address" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Address
              </label>
              <textarea
                id="company-address"
                rows={3}
                className={FIELD_CLASS}
                value={profile.address}
                onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))}
                placeholder="Jl. Sudirman No. 123, Jakarta 10220"
              />
            </div>

            <Button type="button" onClick={handleSaveProfile}>
              Save Profile
            </Button>
          </div>
        )}
      </Panel>

      {/* Bank accounts */}
      <Panel
        title="Bank Accounts"
        description="Saved accounts you can quickly attach to invoices. Invoices keep a snapshot, so past invoices are never affected by edits here."
      >
        <div className="space-y-3">
          {data.bankAccounts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center">
              <Banknote className="h-6 w-6 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">No bank accounts yet</p>
              <p className="text-xs text-slate-400">
                Add one so your clients know exactly where to pay.
              </p>
            </div>
          ) : (
            data.bankAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{account.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {account.holder} · <span className="font-mono">{account.accountNumber}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditBank(account)}
                    aria-label={`Edit ${account.name}`}
                    className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 active:scale-[0.92]"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingBank(account)}
                    aria-label={`Delete ${account.name}`}
                    className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors duration-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-500 active:scale-[0.92]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}

          <Button type="button" variant="secondary" onClick={openAddBank}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Add Bank Account
          </Button>
        </div>
      </Panel>

      {/* Account */}
      <Panel
        title="Your Account"
        description="Sign-in credentials and details for your BillFolio account."
      >
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-base font-extrabold text-white">
            {(userProfile?.username ?? "?").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
              {userProfile?.username ?? "…"}
              {isSuperAdmin && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Super Admin
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500">
              {isSuperAdmin
                ? "You can manage users, companies and workspace access."
                : "You can access the companies shared with you by an admin."}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
              New password
            </label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 12 characters"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Confirm new password
            </label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat the new password"
            />
          </div>
          {pwError && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 sm:col-span-2">
              {pwError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button
              type="button"
              onClick={() => void handleChangePassword()}
              disabled={pwSaving || !newPassword}
            >
              {pwSaving ? "Updating…" : "Update Password"}
            </Button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-6">
          <p className="text-xs text-slate-400">
            Data is stored securely in Supabase — accessible from any device with your account.
          </p>
          <Button type="button" variant="danger" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </Panel>

      {/* Bank modal */}
      <Modal open={bankModal} title={bankEditingId ? "Edit Bank Account" : "Add Bank Account"} onClose={() => setBankModal(false)}>
        <div className="space-y-4">
          <div>
            <label htmlFor="bank-name" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Bank name
            </label>
            <input
              id="bank-name"
              className={FIELD_CLASS}
              value={bankForm.name}
              onChange={(e) => setBankForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="BCA"
            />
          </div>
          <div>
            <label htmlFor="bank-holder" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Account holder
            </label>
            <input
              id="bank-holder"
              className={FIELD_CLASS}
              value={bankForm.holder}
              onChange={(e) => setBankForm((f) => ({ ...f, holder: e.target.value }))}
              placeholder="Acme Studio Pte. Ltd."
            />
          </div>
          <div>
            <label htmlFor="bank-number" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Account number
            </label>
            <input
              id="bank-number"
              inputMode="numeric"
              className={FIELD_CLASS}
              value={bankForm.accountNumber}
              onChange={(e) => setBankForm((f) => ({ ...f, accountNumber: e.target.value }))}
              placeholder="1234 5678 9012"
            />
          </div>
          {bankError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
              {bankError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setBankModal(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveBank}>
              {bankEditingId ? "Save Changes" : "Add Account"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bank delete confirm */}
      <ConfirmDialog
        open={deletingBank !== null}
        title="Delete bank account?"
        message={
          deletingBank ? (
            <>
              Delete <span className="font-semibold">{deletingBank.name}</span>
              {bankUsedCount(deletingBank.id) > 0 ? (
                <>
                  {" "}
                  (used by {bankUsedCount(deletingBank.id)} invoice
                  {bankUsedCount(deletingBank.id) === 1 ? "" : "s"} — existing invoices keep their
                  saved details)
                </>
              ) : null}{" "}
              — are you sure?
            </>
          ) : null
        }
        confirmLabel="Delete Account"
        onConfirm={confirmDeleteBank}
        onCancel={() => setDeletingBank(null)}
      />
    </div>
  );
}
