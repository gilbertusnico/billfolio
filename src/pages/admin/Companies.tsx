import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Search as SearchIcon,
  Trash2,
  Users as UsersIcon,
  X as XIcon,
} from "lucide-react";
import { useToast } from "../../components/Toast";
import Button from "../../components/Button";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import {
  adminSoftDeleteCompany,
  fetchAllCompaniesAdmin,
  fetchAllUsers,
  fetchCompanyMembers,
  friendlyError,
  setCompanyUsers,
} from "../../lib/api";
import type { Company, CompanyMember } from "../../types";

const PAGE_SIZE = 10;

function getPageNumbers(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1, 2, totalPages - 1]);
  const normalized = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  const result: Array<number | "ellipsis"> = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const page = normalized[index];
    const previous = normalized[index - 1];
    if (previous !== undefined && page - previous > 1) {
      result.push("ellipsis");
    }
    result.push(page);
  }

  return result;
}

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

  const [companyQuery, setCompanyQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [deleting, setDeleting] = useState<Company | null>(null);
  const [companyPage, setCompanyPage] = useState(1);
  const [accessPage, setAccessPage] = useState(1);

  useEffect(() => {
    setCompanyPage(1);
  }, [companyQuery]);

  useEffect(() => {
    setAccessPage(1);
  }, [userQuery]);

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
    setUserQuery("");
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

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await adminSoftDeleteCompany(deleting.id);
      showToast(`Company “${deleting.companyName || "Untitled company"}” deleted`);
      setDeleting(null);
      void load();
    } catch (err) {
      showToast(friendlyError(err), "error");
      setDeleting(null);
    }
  };

  const memberCount = (companyId: string) =>
    members.filter((m) => m.companyId === companyId).length;

  const normalized = (s: string) => s.trim().toLowerCase();
  const filteredCompanies = companies.filter((c) =>
    (c.companyName || "").toLowerCase().includes(normalized(companyQuery))
  );
  const filteredUsers = [...users.entries()].filter(([, username]) =>
    username.toLowerCase().includes(normalized(userQuery))
  );
  const companyTotalPages = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE));
  const safeCompanyPage = Math.min(companyPage, companyTotalPages);
  const pagedCompanies = filteredCompanies.slice(
    (safeCompanyPage - 1) * PAGE_SIZE,
    safeCompanyPage * PAGE_SIZE
  );
  const accessTotalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safeAccessPage = Math.min(accessPage, accessTotalPages);
  const pagedAccessUsers = filteredUsers.slice(
    (safeAccessPage - 1) * PAGE_SIZE,
    safeAccessPage * PAGE_SIZE
  );

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
          <>
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="admin-company-search"
                  type="search"
                  aria-label="Search companies by name"
                  className="input w-full pl-9 pr-9"
                  placeholder="Search companies by name…"
                  value={companyQuery}
                  onChange={(e) => setCompanyQuery(e.target.value)}
                />
                {companyQuery && (
                  <button
                    type="button"
                    aria-label="Clear company search"
                    onClick={() => setCompanyQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            {filteredCompanies.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <p className="font-bold text-slate-700">
                  No companies match "{companyQuery}"
                </p>
                <p className="max-w-sm text-sm text-slate-500">
                  Try a different search term, or clear the search to see every workspace.
                </p>
                <Button type="button" variant="ghost" onClick={() => setCompanyQuery("")}>
                  Clear search
                </Button>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {pagedCompanies.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-col gap-3 px-5 py-4 md:flex-row md:flex-wrap md:items-center md:gap-3"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                          {c.logoUrl ? (
                            <img src={c.logoUrl} alt="" className="h-full w-full object-contain p-0.5" />
                          ) : (
                            <Building2 className="h-5 w-5 text-slate-300" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-bold text-slate-900">{c.companyName || "Untitled company"}</p>
                          <p className="break-words text-xs text-slate-500">
                            Owner: <span className="font-medium text-slate-600">{ownerName(c)}</span> ·{" "}
                            {memberCount(c.id)} member{memberCount(c.id) === 1 ? "" : "s"} · created{" "}
                            {formatDate(c.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="flex w-full items-center justify-end gap-1.5 md:w-auto md:justify-start">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => openAccess(c)}
                          className="w-full justify-center md:w-auto"
                        >
                          <UsersIcon className="h-4 w-4" />
                          Manage Access
                        </Button>
                        <button
                          type="button"
                          onClick={() => setDeleting(c)}
                          aria-label={`Delete ${c.companyName || "this company"}`}
                          className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors duration-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-500 active:scale-[0.92]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                {companyTotalPages > 1 && (
                  <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Page {safeCompanyPage} of {companyTotalPages}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCompanyPage((p) => Math.max(1, p - 1))}
                        disabled={safeCompanyPage === 1}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Prev
                      </button>

                      {getPageNumbers(safeCompanyPage, companyTotalPages).map((page, index) => {
                        if (page === "ellipsis") {
                          return (
                            <span key={`ellipsis-${index}`} className="px-1 text-slate-400">
                              …
                            </span>
                          );
                        }

                        const isCurrent = page === safeCompanyPage;
                        return (
                          <button
                            key={page}
                            type="button"
                            onClick={() => setCompanyPage(page)}
                            className={`min-w-8 rounded-lg border px-2 py-1.5 text-center font-semibold transition-colors duration-150 ${
                              isCurrent
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => setCompanyPage((p) => Math.min(companyTotalPages, p + 1))}
                        disabled={safeCompanyPage === companyTotalPages}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
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
        <div className="relative mt-4">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="admin-user-search"
            type="search"
            aria-label="Search users by name"
            className="input w-full pl-9 pr-9"
            placeholder="Search users by name…"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
          />
          {userQuery && (
            <button
              type="button"
              aria-label="Clear user search"
              onClick={() => setUserQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-600"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-3 max-h-96 space-y-1.5 overflow-y-auto pr-1">
          {users.size === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No users yet — create them from the Users page first.
            </p>
          ) : filteredUsers.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No users match "<span className="font-medium">{userQuery}</span>" — try a different
              name.
            </p>
          ) : (
            pagedAccessUsers
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

        {accessTotalPages > 1 && filteredUsers.length > 0 && (
          <div className="mt-3 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Page {safeAccessPage} of {accessTotalPages}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAccessPage((p) => Math.max(1, p - 1))}
                disabled={safeAccessPage === 1}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>

              {getPageNumbers(safeAccessPage, accessTotalPages).map((page, index) => {
                if (page === "ellipsis") {
                  return (
                    <span key={`ellipsis-${index}`} className="px-1 text-slate-400">
                      …
                    </span>
                  );
                }

                const isCurrent = page === safeAccessPage;
                return (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setAccessPage(page)}
                    className={`min-w-8 rounded-lg border px-2 py-1.5 text-center font-semibold transition-colors duration-150 ${
                      isCurrent
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {page}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setAccessPage((p) => Math.min(accessTotalPages, p + 1))}
                disabled={safeAccessPage === accessTotalPages}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

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

      {/* Soft-delete company confirm */}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this company?"
        message={
          deleting ? (
            <>
              Delete <span className="font-semibold">{deleting.companyName || "Untitled company"}</span>?
              The workspace disappears for everyone and its public invoice links stop working. The
              data is kept in the database (soft delete) and can be restored by a Super Admin — only
              proceed if you're sure.
            </>
          ) : null
        }
        confirmLabel="Delete Company"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}