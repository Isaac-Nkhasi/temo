import { FormEvent, useState } from "react";
import { supabase } from "./lib/supabase";

export function Login({ notice }: { notice?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError(err.message);
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="logo">T</div>
        <h1>Security Portal</h1>
        <p className="muted">Authorised administrators only. All activity is logged.</p>
        {notice && <div className="alert warn">{notice}</div>}
        <label>Email<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <div className="alert error" role="alert">{error}</div>}
        <button className="btn primary" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
      </form>
    </div>
  );
}

export function MfaChallenge({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.find((f) => f.status === "verified");
    if (!totp) { setError("No authenticator found."); setBusy(false); return; }
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: code.trim() });
    if (err) setError(err.message); else onDone();
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="logo">T</div>
        <h1>Two-factor check</h1>
        <p className="muted">Enter the 6-digit code from your authenticator app.</p>
        <label>Code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoFocus required value={code} onChange={(e) => setCode(e.target.value)} /></label>
        {error && <div className="alert error" role="alert">{error}</div>}
        <button className="btn primary" disabled={busy}>{busy ? "Verifying…" : "Verify"}</button>
        <button type="button" className="link" onClick={onCancel}>Cancel and sign out</button>
      </form>
    </div>
  );
}
