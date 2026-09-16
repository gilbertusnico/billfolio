import { useState } from "react";
import { Building2, Mail, Pencil, Phone, Plus, Trash2, UserRound } from "lucide-react";
import { useInvoiceData } from "../context/InvoiceDataContext";
import { useToast } from "../components/Toast";
import Button from "../components/Button";
import ClientModal from "../components/ClientModal";
import type { ClientInput } from "../components/ClientModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { SkeletonRows } from "../components/Skeleton";
import type { Client } from "../types";

export default function Clients() {
  const { data, isLoading, upsertClient, deleteClient } = useInvoiceData();
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditing(client);
    setModalOpen(true);
  };

  const handleSave = (input: ClientInput) => {
    const nowIso = new Date().toISOString();
    if (editing) {
      upsertClient({ ...editing, ...input, updatedAt: nowIso });
      showToast("Client Updated");
    } else {
      upsertClient({ id: crypto.randomUUID(), ...input, createdAt: nowIso, updatedAt: nowIso });
      showToast("Client Added");
    }
    setModalOpen(false);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    deleteClient(deleting.id);
    showToast("Client Deleted");
    setDeleting(null);
  };

  if (isLoading) {
    return <SkeletonRows rows={6} />;
  }

  const clients = [...data.clients].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">
          {clients.length === 0
            ? "No clients yet"
            : `${clients.length} client${clients.length === 1 ? "" : "s"}`}
        </p>
        <Button type="button" onClick={openAdd}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Add Client
        </Button>
      </div>

      {clients.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <UserRound className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm font-bold text-slate-900">No clients yet</p>
          <p className="max-w-xs text-sm leading-relaxed text-slate-500">
            Add your first client — or create one inline while building an invoice. Their details
            are saved to every invoice you send them.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clients.map((client) => (
            <li
              key={client.id}
              className="group animate-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">{client.name}</p>
                    {client.company && (
                      <p className="truncate text-xs font-medium text-slate-500">
                        {client.company}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => openEdit(client)}
                    aria-label={`Edit ${client.name}`}
                    className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 active:scale-[0.92]"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(client)}
                    aria-label={`Delete ${client.name}`}
                    className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors duration-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-500 active:scale-[0.92]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
                {client.email ? (
                  <p className="flex items-center gap-2 truncate text-slate-600">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {client.email}
                  </p>
                ) : null}
                {client.phone ? (
                  <p className="flex items-center gap-2 text-slate-600">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {client.phone}
                  </p>
                ) : null}
                {!client.email && !client.phone && (
                  <p className="text-slate-400">No contact details yet — click edit to add some.</p>
                )}
              </div>
              {client.address && (
                <p className="mt-2 truncate text-xs text-slate-400" title={client.address}>
                  {client.address}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <ClientModal
        open={modalOpen}
        client={editing}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete client?"
        message={
          deleting ? (
            <>
              Are you sure you want to delete{" "}
              <span className="font-semibold">{deleting.name}</span>? Existing invoices keep a
              saved copy of their details, so nothing you've sent will change.
            </>
          ) : null
        }
        confirmLabel="Delete Client"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}