import { useCallback, useEffect, useState } from "react";
import { api, Permission, Role, ROLES, ROLE_LABEL } from "../lib/api";

const MODULE_LABEL: Record<string, string> = {
  home: "Home", community: "Community", marketplace: "Marketplace", insights: "Agricultural insights",
  farmer_profiles: "Farmer profiles", blockchain_records: "Blockchain records", security_settings: "Security settings",
};
const SCOPES = ["none", "own", "limited", "all"];

export function Permissions({ flash }: { flash: (m: string, bad?: boolean) => void }) {
  const [rows, setRows] = useState<Permission[]>([]);
  const load = useCallback(async () => {
    try { setRows(await api.permissions()); } catch (e) { flash(e instanceof Error ? e.message : "Could not load", true); }
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const modules: string[] = Array.from(new Set<string>(rows.map((r) => r.module)));
  const get = (role: Role, module: string) => rows.find((r) => r.role === role && r.module === module);

  const change = async (role: Role, module: string, patch: Partial<Pick<Permission, "can_read" | "can_write" | "scope">>) => {
    const cur = get(role, module);
    if (!cur) return;
    const next = { ...patch };
    if (next.can_read === false) next.can_write = false;          // write implies read
    if (next.can_write === true) next.can_read = true;
    setRows((rs) => rs.map((r) => (r.role === role && r.module === module ? { ...r, ...next } : r)));
    try { await api.setPermission(role, module, next); flash(`${ROLE_LABEL[role]} · ${MODULE_LABEL[module] ?? module} updated`); }
    catch (e) { flash(e instanceof Error ? e.message : "Update failed", true); load(); }
  };

  return (
    <>
      <h1>Roles & permissions</h1>
      <p className="muted">
        Read/write access per actor and module. Write rights for community, marketplace and farmer profiles are enforced by the
        database (row-level security), so a change here takes effect immediately for the next request.
      </p>
      <div className="table-wrap">
        <table className="matrix">
          <thead>
            <tr><th>Module</th>{ROLES.map((r) => <th key={r}>{ROLE_LABEL[r]}</th>)}</tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m}>
                <td><strong>{MODULE_LABEL[m] ?? m}</strong></td>
                {ROLES.map((role) => {
                  const p = get(role, m);
                  if (!p) return <td key={role}>—</td>;
                  const locked = role === "admin";
                  return (
                    <td key={role}>
                      <label className="check"><input type="checkbox" checked={p.can_read} disabled={locked} onChange={(e) => change(role, m, { can_read: e.target.checked })} /> Read</label>
                      <label className="check"><input type="checkbox" checked={p.can_write} disabled={locked} onChange={(e) => change(role, m, { can_write: e.target.checked })} /> Write</label>
                      <select value={p.scope} disabled={locked} onChange={(e) => change(role, m, { scope: e.target.value })} aria-label="Scope">
                        {SCOPES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Admin permissions are locked so administrators can never lock themselves out. Scope documents the intended row access (own / limited / all); row ownership is enforced by RLS policies.</p>
    </>
  );
}
