import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";

type Factor = { id: string; friendly_name?: string; status: string };

export function MySecurity({ flash }: { flash: (m: string, bad?: boolean) => void }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [aal, setAal] = useState("aal1");
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(((data?.totp ?? []) as Factor[]));
    const lvl = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal(lvl.data?.currentLevel ?? "aal1");
  }, []);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Admin ${new Date().toISOString().slice(0, 10)}` });
    if (error) { flash(error.message, true); return; }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!enroll) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
    if (error) { flash(error.message, true); return; }
    setEnroll(null); setCode(""); flash("Two-factor authentication enabled"); api.log("mfa_enrolled"); load();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Remove this authenticator?")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) { flash(error.message, true); return; }
    api.log("mfa_removed"); load();
  };

  const verified = factors.filter((f) => f.status === "verified");

  return (
    <>
      <h1>My security</h1>
      <p className="muted">Protect your administrator account with a time-based one-time code (Google Authenticator, Authy, 1Password…).</p>
      <section className="panel">
        <h2>Two-factor authentication</h2>
        <p>Current session level: <span className="chip">{aal === "aal2" ? "2FA verified" : "password only"}</span></p>
        {verified.map((f) => (
          <div className="factor" key={f.id}>
            <span>{f.friendly_name ?? "Authenticator"} <span className="chip">verified</span></span>
            <button className="btn small" onClick={() => remove(f.id)}>Remove</button>
          </div>
        ))}
        {!verified.length && !enroll && <button className="btn primary" onClick={start}>Set up authenticator</button>}
        {enroll && (
          <form className="enroll" onSubmit={verify}>
            <img src={enroll.qr} alt="QR code to scan with your authenticator app" width={180} height={180} />
            <p className="muted small">Can’t scan? Enter this key manually: <code>{enroll.secret}</code></p>
            <label>6-digit code<input inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} /></label>
            <button className="btn primary">Verify & enable</button>
          </form>
        )}
      </section>
      <p className="muted small">After enrolling, open <b>Access policies</b> and switch on <code>require_admin_mfa</code> so administrator powers only work in 2FA-verified sessions.</p>
    </>
  );
}
