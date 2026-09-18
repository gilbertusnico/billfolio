import { useCallback, useEffect, useState } from "react";
import { Building2, Users as UsersIcon } from "lucide-react";
import { useToast } from "../../components/Toast";
import Button from "../../components/Button";
import Modal from "../../components/Modal";
import {
  fetchAllCompaniesAdmin,
  fetchAllUsers,
  fetchCompanyMembers,
  friendlyError,
  setCompanyUsers,
} from "../../lib/api";
import type { Company, CompanyMember } from "../../types";

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminCompaniesPage() {
  const { showToast } = useToast();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<Map<string, CompanyMember["username"]>>(new Map());
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [accessFor, setAccessFor] = useState<Company | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [companyList, memberList] = await Promise.all([
        fetchAllCompaniesAdmin(),
        fetchCompanyMembers(),
      ]);
      const profileList = await fetchAllUsers();
      setCompanies(companyList);
      setMembers(memberList);
      setUsers(new Map(profileList.map((u) => [u.id, u.username])));
    } catch (err) {
      showToast(friendlyError(err), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAccess = (company: Company) => {
    const memberIds = new Set(
      members.filter((m) => m.companyId === company.id).map((m) => m.userId)
    );
    setSelected(memberIds);
    setAccessFor(company);
  };

  const toggleUser = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const saveAccess = async () => {
    if (!accessFor) return;
    setSaving(true);
    try {
      // The owner's membership row must survive — it's always included.
      const userIds = [...new Set([...selected, accessFor.ownerId])];
      await setCompanyUsers(accessFor.id, userIds);
      showToast(`Access updated for ${accessFor.companyName}`);
      setAccessFor(null);
      void load();
    } catch (err) {
      showToast(friendlyError(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const ownerName = (company: Company) => {
    const owner = members.find(
      (m) => m.companyId === company.id && (m.role === "owner" || m.userId === company.ownerId)
    );
    return owner?.username ?? "—";
  };

  const memberCount = (companyId: string) =>
    members.filter((m) => m.companyId === companyId).length;

  return (
    <div className="space-y-6">
      <div className="animate-fade-in">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900">
          <Building2 className="h-5 w-5 text-blue-600" />
          Companies & Access
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Every workspace in BillFolio, and which team members can see its invoices.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : companies.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Building2 className="h-6 w-6 text-slate-400" />
            </span>
            <p className="font-bold text-slate-700">No companies yet</p>
            <p className="max-w-sm text-sm text-slate-500">
              Once a team member creates their company in onboarding, it appears here and you can
              open it up to more people.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {companies.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {c.logoUrl ? (
                    <img src={c.logoUrl} alt="" className="h-full w-full object-contain p-0.5" />
                  ) : (
                    <Building2 className="h-5 w-5 text-slate-300" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-900">{c.companyName || "Untitled company"}</p>
                  <p className="truncate text-xs text-slate-500">
                    Owner: <span className="font-medium text-slate-600">{ownerName(c)}</span> ·{" "}
                    {memberCount(c.id)} member{memberCount(c.id) === 1 ? "" : "s"} · created{" "}
                    {formatDate(c.createdAt)}
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={() => openAccess(c)}>
                  <UsersIcon className="h-4 w-4" />
                  Manage Access
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Access modal */}
      <Modal
        open={accessFor !== null}
        title={accessFor ? `Access — ${accessFor.companyName}` : "Manage Access"}
        onClose={() => setAccessFor(null)}
        maxWidth="max-w-lg"
      >
        <p className="-mt-2 text-sm text-slate-500">
          Tick the team members who should see this company's invoices. The owner always keeps
          access.
        </p>
        <div className="mt-4 max-h-96 space-y-1.5 overflow-y-auto pr-1">
          {users.size === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No users yet — create them from the Users page first.
            </p>
          ) : (
            [...users.entries()]
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([userId, username]) => {
                const isOwner = accessFor?.ownerId === userId;
                const checked = selected.has(userId);
                return (
                  <label
                    key={userId}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors duration-150 ${
                      isOwner
                        ? "border-amber-200 bg-amber-50/60"
                        : checked
                          ? "border-blue-200 bg-blue-50/60"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600"
                      checked={checked}
                      disabled={isOwner}
                      onChange={() => toggleUser(userId)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {username}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {isOwner ? "Owner — always has access" : "Team member"}
                      </span>
                    </span>
                    {isOwner && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                        OWNER
                      </span>
                    )}
                  </label>
                );
              })
          )}
        </div>

        {accessFor && users.size > 0 && (
          <p className="mt-3 text-xs text-slate-400">
            {selected.size} of {users.size} users have access
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setAccessFor(null)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void saveAccess()} disabled={saving}>
            {saving ? "Saving…" : "Save Access"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}