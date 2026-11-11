import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { api, fmtDate, Policy } from "../lib/api";

export function Policies({ flash }: { flash: (m: string, bad?: boolean) => void }) {
  const [rows, setRows] = useState<Policy[]>([]);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [aal2, setAal2] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await api.policies()); } catch (e) { flash(e instanceof Error ? e.message : "Could not load", true); }
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal2(data?.currentLevel === "aal2");
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const save = async (key: string, value: unknown) => {
    try { await api.setPolicy(key, value); flash(`Policy "${key}" updated`); await load(); }
    catch (e) { flash(e instanceof Error ? e.message : "Update failed", true); }
  };

  return (
    <>
      <h1>Access policies</h1>
      <p className="muted">System-wide switches enforced in the database. Changes are audit-logged with the old and new value.</p>
      <div className="policy-list">
        {rows.map((p) => {
          const isBool = typeof p.value === "boolean";
          const mfaBlocked = p.key === "require_admin_mfa" && p.value === false && !aal2;
          return (
            <section className="panel policy" key={p.key}>
              <div>
                <h3>{p.key}</h3>
                <p>{p.description}</p>
                <small className="muted">Last changed {fmtDate(p.updated_at)}</small>
                {mfaBlocked && <div className="alert warn">Sign in with a two-factor code (My security) before enabling this, or you could lock yourself out.</div>}
              </div>
              {isBool ? (
                <label className="switch">
                  <input type="checkbox" checked={p.value as boolean} disabled={mfaBlocked}
                    onChange={(e) => save(p.key, e.target.checked)} />
                  <span />
                </label>
              ) : (
                <div className="num-edit">
                  <input type="number" min={0} value={numbers[p.key] ?? String(p.value)}
                    onChange={(e) => setNumbers((n) => ({ ...n, [p.key]: e.target.value }))} />
                  <button className="btn small primary" disabled={numbers[p.key] === undefined || numbers[p.key] === String(p.value)}
                    onClick={() => save(p.key, Number(numbers[p.key]))}>Save</button>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
