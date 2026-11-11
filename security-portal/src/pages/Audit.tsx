import { useEffect, useMemo, useState } from "react";
import { AdminUser, api, AuditRow, fmtDate } from "../lib/api";

export function Audit({ flash }: { flash: (m: string, bad?: boolean) => void }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [action, setAction] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  const load = async () => {
    try {
      const [logs, users] = await Promise.all([api.audit(500), api.users()]);
      setRows(logs);
      setNames(Object.fromEntries(users.map((u: AdminUser) => [u.id, u.full_name])));
    } catch (e) { flash(e instanceof Error ? e.message : "Could not load audit log", true); }
  };
  useEffect(() => { load(); }, []);

  const actions = useMemo(() => Array.from(new Set(rows.map((r) => r.action))).sort(), [rows]);
  const shown = rows.filter((r) =>
    (action === "all" || r.action === action) &&
    `${r.action} ${r.entity ?? ""} ${r.entity_id ?? ""} ${names[r.actor_id ?? ""] ?? ""} ${JSON.stringify(r.metadata)}`.toLowerCase().includes(q.toLowerCase()));

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["time,actor,action,entity,entity_id,metadata",
      ...shown.map((r) => [r.created_at, names[r.actor_id ?? ""] ?? r.actor_id ?? "system", r.action, r.entity, r.entity_id, JSON.stringify(r.metadata)].map(esc).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `temo-audit-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    api.log("audit_exported", { rows: shown.length });
  };

  return (
    <>
      <h1>Audit logs</h1>
      <p className="muted">Immutable record of security-relevant events. Rows can be read by administrators only and cannot be edited from the app.</p>
      <div className="toolbar">
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="all">All actions</option>
          {actions.map((a) => <option key={a}>{a}</option>)}
        </select>
        <button className="btn" onClick={load}>Refresh</button>
        <button className="btn" onClick={exportCsv}>Export CSV</button>
        <span className="muted">{shown.length} events</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{fmtDate(r.created_at)}</td>
                <td>{r.actor_id ? names[r.actor_id] ?? r.actor_id.slice(0, 8) : <span className="muted">system</span>}</td>
                <td><span className="chip">{r.action}</span></td>
                <td>{r.entity}{r.entity_id ? <small>{r.entity_id.slice(0, 13)}</small> : null}</td>
                <td>
                  <button className="link" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "View"}</button>
                  {open === r.id && <pre>{JSON.stringify(r.metadata, null, 2)}</pre>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="empty">No events.</p>}
      </div>
    </>
  );
}
