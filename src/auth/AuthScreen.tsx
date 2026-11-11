import { FormEvent, useState } from "react";
import { useAuth } from "./AuthProvider";
import "./auth.css";

type Mode = "login" | "signup" | "reset";

export function AuthScreen() {
  const { signIn, signUp, resetPassword, districts } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [district, setDistrict] = useState("Maseru");
  const [role, setRole] = useState<"farmer" | "buyer">("farmer");
  const [farmName, setFarmName] = useState("");
  const [farmType, setFarmType] = useState("Crop production");
  const [consent, setConsent] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setNotice("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email.trim(), password);
      } else if (mode === "signup") {
        if (!consent) throw new Error("Please accept the privacy notice to create an account.");
        if (password.length < 8) throw new Error("Password must be at least 8 characters.");
        const { needsConfirmation } = await signUp({
          email: email.trim(), password, fullName: fullName.trim(), phone: phone.trim(),
          district, role, farmName: farmName.trim(), farmType,
        });
        if (needsConfirmation) {
          setNotice("Account created. Check your email to confirm it, then log in.");
          setMode("login");
        }
      } else {
        await resetPassword(email.trim());
        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell auth-shell">
      <div className="auth-hero">
        <div className="auth-mark">T</div>
        <h1>Temo</h1>
        <p>Lesotho Farmer Community</p>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <h2>{mode === "login" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset password"}</h2>
        <p className="auth-sub">
          {mode === "login" && "Log in to buy, sell and learn with farmers across Lesotho."}
          {mode === "signup" && "Join farmers and buyers across all ten districts."}
          {mode === "reset" && "Enter your email and we’ll send you a reset link."}
        </p>

        {mode === "signup" && (
          <>
            <div className="auth-roles" role="radiogroup" aria-label="I am a">
              {(["farmer", "buyer"] as const).map((r) => (
                <button type="button" key={r} className={role === r ? "active" : ""} onClick={() => setRole(r)}>
                  {r === "farmer" ? "I’m a farmer" : "I’m a buyer"}
                </button>
              ))}
            </div>
            <label>Full name
              <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Mpho Nthako" autoComplete="name" />
            </label>
          </>
        )}

        <label>Email
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="farmer@example.com" autoComplete="email" />
        </label>

        {mode !== "reset" && (
          <label>Password
            <input required type="password" minLength={mode === "signup" ? 8 : undefined} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters"
              autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </label>
        )}

        {mode === "signup" && (
          <>
            <div className="auth-row">
              <label>Phone
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+266 5…" autoComplete="tel" inputMode="tel" />
              </label>
              <label>District
                <select value={district} onChange={(e) => setDistrict(e.target.value)}>
                  {(districts.length ? districts.map((d) => d.name) : ["Maseru"]).map((n) => <option key={n}>{n}</option>)}
                </select>
              </label>
            </div>
            {role === "farmer" && (
              <div className="auth-row">
                <label>Farm name
                  <input value={farmName} onChange={(e) => setFarmName(e.target.value)} placeholder="Nthako Family Farm" />
                </label>
                <label>Farm type
                  <select value={farmType} onChange={(e) => setFarmType(e.target.value)}>
                    <option>Crop production</option>
                    <option>Livestock</option>
                    <option>Mixed farming</option>
                    <option>Horticulture</option>
                  </select>
                </label>
              </div>
            )}
            <label className="auth-consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                I agree to Temo storing my details to run my account and marketplace orders. I can view, correct or
                delete my data at any time.
              </span>
            </label>
            <details className="auth-privacy">
              <summary>What we store and why</summary>
              <p>Name, email, phone, district and farm details (to run your account); marketplace listings, orders and
              community posts (to provide the service). Phone and email are never shown to other users. Order records
              may be kept after account deletion in anonymised form for accounting and traceability.</p>
            </details>
          </>
        )}

        {error && <div className="auth-error" role="alert">{error}</div>}
        {notice && <div className="auth-notice" role="status">{notice}</div>}

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset link"}
        </button>

        <div className="auth-links">
          {mode !== "login" && <button type="button" onClick={() => switchMode("login")}>Back to log in</button>}
          {mode === "login" && (
            <>
              <button type="button" onClick={() => switchMode("signup")}>Create an account</button>
              <button type="button" onClick={() => switchMode("reset")}>Forgot password?</button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

export function SetupScreen() {
  return (
    <div className="app-shell auth-shell">
      <div className="auth-card">
        <h2>Connect Supabase</h2>
        <p className="auth-sub">
          Create a <code>.env</code> file in the project root (copy <code>.env.example</code>) and add your project URL
          and anon key from Supabase → Project Settings → API. Then restart <code>pnpm dev</code>.
        </p>
        <pre className="auth-code">{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...`}</pre>
      </div>
    </div>
  );
}
