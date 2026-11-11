import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminUser, api, fmtDate, Role, ROLES, ROLE_LABEL, Status } from "../lib/api";

type Draft = { role: Role; status: Status; verified: boolean };

export function Users({ meId, flash }: { meId: string; flash: (m: string, bad?: boolean) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setUsers(await api.users()); setDrafts({}); }
    catch (e) { flash(e instanceof Error ? e.message : "Could not load users", true); }
    finally { setLoading(false); }
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => users.filter((u) =>
    (roleFilter === "all" || u.role === roleFilter) &&
    `${u.full_name} ${u.email} ${u.district ?? ""} ${u.farm_name ?? ""}`.toLowerCase().includes(q.toLowerCase())), [users, q, roleFilter]);

  const draftOf = (u: AdminUser): Draft => drafts[u.id] ?? { role: u.role, status: u.status, verified: u.verified_seller };
  const setDraft = (u: AdminUser, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [u.id]: { ...draftOf(u), ...patch } }));
  const dirty = (u: AdminUser) => !!drafts[u.id] &&
    (drafts[u.id].role !== u.role || drafts[u.id].status !== u.status || drafts[u.id].verified !== u.verified_seller);

  const save = async (u: AdminUser) => {
    const d = draftOf(u);
    if (d.role !== u.role && !window.confirm(`Change ${u.full_name} from ${ROLE_LABEL[u.role]} to ${ROLE_LABEL[d.role]}?`)) return;
    try { await api.updateUser(u.id, d.role, d.status, d.verified); flash(`Updated ${u.full_name}`); await load(); }
    catch (e) { flash(e instanceof Error ? e.message : "Update failed", true); }
  };

  return (
    <>
      <h1>User management</h1>
      <p className="muted">Assign roles, suspend accounts and verify sellers. Every change is written to the audit log.</p>
      <div className="toolbar">
        <input placeholder="Search name, email, district…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <span className="muted">{shown.length} of {users.length}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>User</th><th>District</th><th>Role</th><th>Status</th><th>Verified</th><th>Last sign-in</th><th /></tr></thead>
          <tbody>
            {shown.map((u) => {
              const d = draftOf(u);
              const locked = u.id === meId || !!u.deleted_at;
              return (
                <tr key={u.id} className={u.deleted_at ? "faded" : ""}>
                  <td><strong>{u.full_name}</strong><small>{u.email}{u.id === meId ? " (you)" : ""}</small></td>
                  <td>{u.district ?? "—"}</td>
                  <td>
                    <select value={d.role} disabled={locked} onChange={(e) => setDraft(u, { role: e.target.value as Role })}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={d.status} disabled={locked} onChange={(e) => setDraft(u, { status: e.target.value as Status })}>
                      <option value="active">Active</option><option value="suspended">Suspended</option>
                      <option value="pending_verification">Pending</option>
                    </select>
                  </td>
                  <td><input type="checkbox" checked={d.verified} disabled={locked || d.role !== "farmer"} onChange={(e) => setDraft(u, { verified: e.target.checked })} aria-label="Verified seller" /></td>
                  <td>{fmtDate(u.last_sign_in_at)}</td>
                  <td>{u.deleted_at ? <span className="chip">Erased</span> : <button className="btn small primary" disabled={!dirty(u) || locked} onClick={() => save(u)}>Save</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && !shown.length && <p className="empty">No users match.</p>}
      </div>
    </>
  );
}
