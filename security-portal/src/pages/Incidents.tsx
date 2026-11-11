import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, fmtDate, Incident } from "../lib/api";

const hoursLeft = (i: Incident) => 72 - (Date.now() - new Date(i.detected_at).getTime()) / 3_600_000;

export function Incidents({ meId, flash }: { meId: string; flash: (m: string, bad?: boolean) => void }) {
  const [items, setItems] = useState<Incident[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("low");
  const [personal, setPersonal] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.incidents()); } catch (e) { flash(e instanceof Error ? e.message : "Could not load", true); }
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.addIncident({ title, description, severity, personal_data_involved: personal, reported_by: meId });
      setTitle(""); setDescription(""); setSeverity("low"); setPersonal(false);
      flash("Incident recorded"); load();
    } catch (err) { flash(err instanceof Error ? err.message : "Could not save", true); }
  };

  const patch = async (i: Incident, p: Partial<Incident>) => {
    try { await api.updateIncident(i.id, p); load(); } catch (err) { flash(err instanceof Error ? err.message : "Update failed", true); }
  };

  return (
    <>
      <h1>Security incidents</h1>
      <p className="muted">Breach and incident register (GDPR Art. 33/34). If personal data is involved, the supervisory authority must be notified within 72 hours of detection.</p>
      <form className="panel form-grid" onSubmit={add}>
        <label>Title<input required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Suspicious repeated login failures" /></label>
        <label>Severity
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
          </select>
        </label>
        <label className="wide">Description<textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="check wide"><input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} /> Personal data may be involved</label>
        <button className="btn primary">Record incident</button>
      </form>

      <div className="incident-list">
        {items.map((i) => {
          const left = hoursLeft(i);
          const needsNotice = i.personal_data_involved && !i.authority_notified_at && i.status !== "resolved";
          return (
            <section className="panel incident" key={i.id}>
              <div className="inc-head">
                <h3>{i.title}</h3>
                <span className={`chip sev-${i.severity}`}>{i.severity}</span>
              </div>
              {i.description && <p>{i.description}</p>}
              <small className="muted">Detected {fmtDate(i.detected_at)}{i.resolved_at ? ` · resolved ${fmtDate(i.resolved_at)}` : ""}</small>
              {needsNotice && (
                <div className={`alert ${left < 12 ? "error" : "warn"}`}>
                  {left > 0 ? `Notify the authority within ${Math.ceil(left)} h (72-hour rule).` : "72-hour notification window has passed – notify now and document the reason."}
                </div>
              )}
              <div className="inc-actions">
                <select value={i.status} onChange={(e) => patch(i, {
                  status: e.target.value as Incident["status"],
                  resolved_at: e.target.value === "resolved" ? new Date().toISOString() : null,
                })}>
                  <option value="open">Open</option><option value="investigating">Investigating</option>
                  <option value="contained">Contained</option><option value="resolved">Resolved</option>
                </select>
                {i.personal_data_involved && (i.authority_notified_at
                  ? <span className="chip">Authority notified {fmtDate(i.authority_notified_at)}</span>
                  : <button className="btn small" onClick={() => patch(i, { authority_notified_at: new Date().toISOString() })}>Mark authority notified</button>)}
              </div>
            </section>
          );
        })}
        {!items.length && <p className="empty">No incidents recorded.</p>}
      </div>
    </>
  );
}
