import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { isValidPhone, sanitizePhone } from "../lib/phone";
import type { Client } from "../types";

export interface ClientInput {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface ClientModalProps {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSave: (input: ClientInput) => void;
}

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function ClientModal({ open, client, onClose, onSave }: ClientModalProps) {
  const [form, setForm] = useState<ClientInput>({
    name: "",
    company: "",
    email: "",
    phone: "",
    address: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: client?.name ?? "",
      company: client?.company ?? "",
      email: client?.email ?? "",
      phone: client?.phone ?? "",
      address: client?.address ?? "",
    });
    setError(null);
  }, [open, client]);

  const set = (field: keyof ClientInput) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError("Client name is required.");
      return;
    }
    const email = (form.email ?? "").trim();
    if (email && !EMAIL_RE.test(email)) {
      setError("That email address doesn't look right — check it and try again.");
      return;
    }
    const rawPhone = (form.phone ?? "").trim();
    if (!rawPhone) {
      setError("Phone number is required — it's how your client receives the WhatsApp link to their invoice.");
      return;
    }
    const phone = sanitizePhone(rawPhone);
    if (!isValidPhone(phone)) {
      setError("That phone number doesn't look right — enter at least 9 digits, e.g. 0812 3456 7890.");
      return;
    }
    onSave({
      name,
      company: form.company?.trim() || undefined,
      email: email || undefined,
      phone,
      address: form.address?.trim() || undefined,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={client ? "Edit Client" : "Add Client"}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="cm-name" className="label">
            Name <span className="text-rose-500">*</span>
          </label>
          <input
            id="cm-name"
            className="input"
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            placeholder="e.g. PT Nusantara Karya"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cm-company" className="label">Company</label>
            <input
              id="cm-company"
              className="input"
              value={form.company ?? ""}
              onChange={(e) => set("company")(e.target.value)}
              placeholder="Company (optional)"
            />
          </div>
          <div>
            <label htmlFor="cm-phone" className="label">
              Phone Number <span className="text-rose-500">*</span>
            </label>
            <input
              id="cm-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              className="input"
              value={form.phone ?? ""}
              onChange={(e) => set("phone")(e.target.value)}
              placeholder="e.g. 0812 3456 7890"
              aria-required="true"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Auto-formatted for WhatsApp — 0812… becomes 62812…
            </p>
          </div>
        </div>
        <div>
          <label htmlFor="cm-email" className="label">Email</label>
          <input
            id="cm-email"
            type="email"
            className="input"
            value={form.email ?? ""}
            onChange={(e) => set("email")(e.target.value)}
            placeholder="billing@example.com (optional)"
          />
        </div>
        <div>
          <label htmlFor="cm-address" className="label">Address</label>
          <textarea
            id="cm-address"
            className="input min-h-[72px] resize-y"
            value={form.address ?? ""}
            onChange={(e) => set("address")(e.target.value)}
            placeholder="Street, city, postal code (optional)"
          />
        </div>

        {error && (
          <p role="alert" className="animate-fade-in text-sm font-medium text-rose-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{client ? "Save Changes" : "Add Client"}</Button>
        </div>
      </form>
    </Modal>
  );
}