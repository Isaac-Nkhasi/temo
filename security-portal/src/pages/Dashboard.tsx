import { useEffect, useState } from "react";
import { api, ROLES, ROLE_LABEL, Role } from "../lib/api";

type Stats = Record<string, any>;

export function Dashboard() {
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.dashboard().then(setS).catch((e) => setError(e.message)); }, []);
  if (error) return <div className="alert error">{error}</div>;
  if (!s) return <p className="muted">Loading…</p>;

  const byRole = (s.users_by_role ?? {}) as Record<string, number>;
  const max = Math.max(1, ...ROLES.map((r) => byRole[r] ?? 0));
  const tile = (label: string, value: number, tone = "", hint = "") => (
    <div className={`tile ${tone}`} key={label}>
      <span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}
    </div>
  );

  return (
    <>
      <h1>Security dashboard</h1>
      <p className="muted">Live overview of accounts, access and compliance activity.</p>
      <div className="tiles">
        {tile("Active accounts", s.users_total)}
        {tile("Suspended", s.users_suspended, s.users_suspended ? "warn" : "")}
        {tile("New users (7 days)", s.new_users_7d)}
        {tile("Unverified sellers", s.unverified_sellers, s.unverified_sellers ? "warn" : "")}
        {tile("Audit events (24 h)", s.audit_24h)}
        {tile("Permission changes (7 d)", s.permission_changes_7d)}
        {tile("Open incidents", s.open_incidents, s.open_incidents ? "danger" : "ok")}
        {tile("Hidden posts", s.posts_hidden)}
      </div>

      <div className="grid2">
        <section className="panel">
          <h2>Users by role</h2>
          {ROLES.map((r: Role) => (
            <div className="bar-row" key={r}>
              <span>{ROLE_LABEL[r]}</span>
              <div className="bar"><div style={{ width: `${((byRole[r] ?? 0) / max) * 100}%` }} /></div>
              <b>{byRole[r] ?? 0}</b>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>Marketplace & community</h2>
          <dl className="kv">
            <dt>Active listings</dt><dd>{s.listings_active}</dd>
            <dt>Orders (total / pending)</dt><dd>{s.orders_total} / {s.orders_pending}</dd>
            <dt>Visible posts</dt><dd>{s.posts_total}</dd>
          </dl>
        </section>
        <section className="panel">
          <h2>GDPR activity</h2>
          <dl className="kv">
            <dt>Consents recorded</dt><dd>{s.consents_recorded}</dd>
            <dt>Data exports (30 d)</dt><dd>{s.gdpr_exports_30d}</dd>
            <dt>Account erasures (30 d)</dt><dd>{s.gdpr_erasures_30d}</dd>
          </dl>
        </section>
      </div>
    </>
  );
}
