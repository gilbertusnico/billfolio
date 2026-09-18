import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ImagePlus, Landmark, X } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import { useToast } from "./Toast";

export interface CompanyInput {
  companyName: string;
  email: string;
  address: string;
  logoUrl: string;
}

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const FIELD_CLASS =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

interface CompanyModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (input: CompanyInput) => void;
  /** When false the modal cannot be closed (used to gate first-time setup). */
  dismissible?: boolean;
}

export default function CompanyModal({
  open,
  onClose,
  onSave,
  dismissible = true,
}: CompanyModalProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<CompanyInput>({
    companyName: "",
    email: "",
    address: "",
    logoUrl: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ companyName: "", email: "", address: "", logoUrl: "" });
      setError(null);
    }
  }, [open]);

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
      setForm((f) => ({ ...f, logoUrl: url }));
    };
    reader.readAsDataURL(file);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const companyName = form.companyName.trim();
    if (!companyName) {
      setError("Give your company a name.");
      return;
    }
    const email = form.email.trim();
    if (email && !EMAIL_RE.test(email)) {
      setError("That email doesn't look right.");
      return;
    }
    onSave({ companyName, email, address: form.address.trim(), logoUrl: form.logoUrl });
  };

  return (
    <Modal open={open} title="Add New Company" onClose={onClose} dismissible={dismissible}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {form.logoUrl ? (
              <img
                src={form.logoUrl}
                alt="Company logo preview"
                className="h-full w-full object-contain"
              />
            ) : (
              <Landmark className="h-7 w-7 text-slate-300" />
            )}
          </div>
          <label className="cursor-pointer">
            <span className="sr-only">Choose a logo image</span>
            <input type="file" accept="image/*" className="sr-only" onChange={onLogoFile} />
            <span className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-all duration-150 ease-out hover:border-blue-400 hover:text-blue-600 active:scale-[0.97]">
              <ImagePlus className="h-4 w-4" />
              {form.logoUrl ? "Change Logo" : "Upload Logo"}
            </span>
          </label>
          {form.logoUrl && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setForm((f) => ({ ...f, logoUrl: "" }))}
            >
              <X className="h-4 w-4" />
              Remove
            </Button>
          )}
        </div>

        <div>
          <label htmlFor="new-company-name" className="mb-1.5 block text-sm font-semibold text-slate-700">
            Company name <span className="text-rose-500">*</span>
          </label>
          <input
            id="new-company-name"
            className={FIELD_CLASS}
            value={form.companyName}
            onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
            placeholder="Acme Studio"
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="new-company-email" className="mb-1.5 block text-sm font-semibold text-slate-700">
            Email
          </label>
          <input
            id="new-company-email"
            type="email"
            className={FIELD_CLASS}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="hello@acmestudio.com"
          />
        </div>

        <div>
          <label htmlFor="new-company-address" className="mb-1.5 block text-sm font-semibold text-slate-700">
            Address
          </label>
          <textarea
            id="new-company-address"
            rows={2}
            className={FIELD_CLASS}
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="Jl. Sudirman No. 123, Jakarta 10220"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {dismissible && (
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button type="submit" className={dismissible ? undefined : "flex-1 justify-center"}>
            Create Company
          </Button>
        </div>
      </form>
    </Modal>
  );
}