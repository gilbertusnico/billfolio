import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Pencil, Plus, ShieldCheck, Trash2, UserRound, Users as UsersIcon } from "lucide-react";
import { useToast } from "../../components/Toast";
import Button from "../../components/Button";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import {
  adminCreateUser,
  adminDeleteUser,
  adminUpdateUser,
  fetchAllUsers,
  friendlyError,
} from "../../lib/api";
import type { UserProfile, UserRole } from "../../types";

const FIELD_CLASS =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

const ROLE_STYLES: Record<UserRole, string> = {
  super_admin: "bg-violet-100 text-violet-700",
  user: "bg-slate-100 text-slate-600",
};

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_STYLES[role]}`}>
      {role === "super_admin" ? "Super Admin" : "User"}
    </span>
  );
}

interface UserDraft {
  username: string;
  password: string;
  role: UserRole;
}

const EMPTY_DRAFT: UserDraft = { username: "", password: "", role: "user" };

export default function AdminUsersPage() {
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState<UserDraft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await fetchAllUsers());
    } catch (err) {
      showToast(friendlyError(err), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setFormError("");
    setCreateOpen(true);
  };

  const openEdit = (u: UserProfile) => {
    setDraft({ username: u.username, password: "", role: u.role });
    setFormError("");
    setEditing(u);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const username = draft.username.trim();
    if (!username || !draft.password) {
      setFormError("Username and password are both required.");
      return;
    }
    if (draft.password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await adminCreateUser(username, draft.password);
      showToast(`User “${username}” created — grant company access from the Companies page`);
      setCreateOpen(false);
      void load();
    } catch (err) {
      setFormError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const username = draft.username.trim();
    if (!username) {
      setFormError("Username can't be empty.");
      return;
    }
    if (draft.password && draft.password.length < 6) {
      setFormError("New password must be at least 6 characters.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await adminUpdateUser(editing.id, {
        username,
        role: draft.role,
        ...(draft.password ? { password: draft.password } : {}),
      });
      showToast(`User “${username}” updated`);
      setEditing(null);
      void load();
    } catch (err) {
      setFormError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await adminDeleteUser(deleting.id);
      showToast(`User “${deleting.username}” deleted`);
      setDeleting(null);
      void load();
    } catch (err) {
      showToast(friendlyError(err), "error");
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="animate-fade-in flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900">
            <UsersIcon className="h-5 w-5 text-blue-600" />
            Team Users
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Create and manage the accounts your team signs in with.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          New User
        </Button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <UserRound className="h-6 w-6 text-slate-400" />
            </span>
            <p className="font-bold text-slate-700">No users yet</p>
            <p className="max-w-sm text-sm text-slate-500">
              Create your first user and they'll appear here. Don't forget to grant them company
              access in the Companies page.
            </p>
            <Button type="button" variant="secondary" className="mt-2" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Create User
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-extrabold text-white">
                  {u.username.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                    {u.username}
                    {u.id === "Nico" && (
                      <span className="text-[11px] font-medium text-slate-400">(you)</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    Password: <span className="font-mono text-slate-600">{u.rawPassword || "—"}</span>
                  </p>
                </div>
                <RoleBadge role={u.role} />
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(u)}
                    aria-label={`Edit ${u.username}`}
                    className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 active:scale-[0.92]"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(u)}
                    aria-label={`Delete ${u.username}`}
                    className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors duration-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-500 active:scale-[0.92]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-center gap-2 text-xs text-slate-400">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        New users start with no company access — assign them from the Companies page so they can
        see shared invoices.
      </p>

      {/* Create user */}
      <Modal open={createOpen} title="Create User" onClose={() => setCreateOpen(false)}>
        <form className="space-y-4" onSubmit={handleCreate} noValidate>
          <div>
            <label htmlFor="nu-username" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Username
            </label>
            <input
              id="nu-username"
              className={FIELD_CLASS}
              value={draft.username}
              onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
              placeholder="e.g. alice"
              autoFocus
            />
            <p className="mt-1 text-xs text-slate-400">Used at sign-in — unique, e.g. alice</p>
          </div>
          <div>
            <label htmlFor="nu-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Password
            </label>
            <input
              id="nu-password"
              type="text"
              className={FIELD_CLASS}
              value={draft.password}
              onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <label htmlFor="nu-role" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Role
            </label>
            <select
              id="nu-role"
              className={FIELD_CLASS}
              value={draft.role}
              onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as UserRole }))}
            >
              <option value="user">User</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <p className="mt-1 text-xs text-slate-400">
              Super Admins can manage users, companies & access — use sparingly.
            </p>
          </div>
          {formError && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create User"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit user modal */}
      <Modal
        open={editing !== null}
        title={editing ? `Edit ${editing.username}` : "Edit User"}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form className="space-y-4" onSubmit={handleEdit} noValidate>
            <div>
              <label htmlFor="eu-username" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Username
              </label>
              <input
                id="eu-username"
                className={FIELD_CLASS}
                value={draft.username}
                onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="eu-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
                New password <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="eu-password"
                type="text"
                className={FIELD_CLASS}
                value={draft.password}
                onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                placeholder="Leave blank to keep the current password"
              />
            </div>
            <div>
              <label htmlFor="eu-role" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Role
              </label>
              <select
                id="eu-role"
                className={FIELD_CLASS}
                value={draft.role}
                onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as UserRole }))}
              >
                <option value="user">User</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            {formError && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete user confirm */}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this user?"
        message={
          deleting ? (
            <>
              Delete <span className="font-semibold">{deleting.username}</span>? They'll lose access
              to every company immediately — this can't be undone.
            </>
          ) : null
        }
        confirmLabel="Delete User"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}