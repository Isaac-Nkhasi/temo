import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isConfigured, supabase } from "./lib/supabase";
import { api } from "./lib/api";
import { Login, MfaChallenge } from "./Login";
import { Dashboard } from "./pages/Dashboard";
import { Users } from "./pages/Users";
import { Permissions } from "./pages/Permissions";
import { Policies } from "./pages/Policies";
import { Audit } from "./pages/Audit";
import { Incidents } from "./pages/Incidents";
import { Moderation } from "./pages/Moderation";
import { MySecurity } from "./pages/MySecurity";

type Page = "dashboard" | "users" | "permissions" | "policies" | "audit" | "incidents" | "moderation" | "security";
const NAV: [Page, string][] = [
  ["dashboard", "Dashboard"], ["users", "Users"], ["permissions", "Roles & permissions"], ["policies", "Access policies"],
  ["audit", "Audit logs"], ["incidents", "Incidents"], ["moderation", "Moderation"], ["security", "My security"],
];
const pageFromHash = (): Page => {
  const h = window.location.hash.replace("#/", "") as Page;
  return NAV.some(([id]) => id === h) ? h : "dashboard";
};

type Gate =
  | { state: "loading" }
  | { state: "login"; notice?: string }
  | { state: "mfa" }
  | { state: "ready"; userId: string; name: string };

export default function App() {
  if (!isConfigured) {
    return (
      <div className="login-wrap"><div className="login-card">
        <h1>Connect Supabase</h1>
        <p className="muted">Copy <code>.env.example</code> to <code>.env</code>, add your project URL and anon key, then restart <code>pnpm dev</code>.</p>
      </div></div>
    );
  }
  return <Portal />;
}

function Portal() {
  const [gate, setGate] = useState<Gate>({ state: "loading" });
  const [page, setPage] = useState<Page>(pageFromHash());
  const [toast, setToast] = useState<{ msg: string; bad: boolean } | null>(null);
  const [idleMinutes, setIdleMinutes] = useState(15);
  const toastTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((msg: string, bad = false) => {
    setToast({ msg, bad });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const evaluate = useCallback(async (session: Session | null) => {
    if (!session) { setGate({ state: "login" }); return; }
    const { data: lvl } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (lvl && lvl.nextLevel === "aal2" && lvl.currentLevel !== "aal2") { setGate({ state: "mfa" }); return; }
    try {
      const profile = await api.profile(session.user.id);
      if (!profile || profile.role !== "admin" || profile.status !== "active") {
        await supabase.auth.signOut();
        setGate({ state: "login", notice: "This account is not authorised to use the Security Portal." });
        return;
      }
      setGate({ state: "ready", userId: profile.id, name: profile.full_name });
      api.log("login");
      api.policies().then((ps) => {
        const p = ps.find((x) => x.key === "admin_idle_timeout_minutes");
        if (p) setIdleMinutes(Math.max(1, Number(p.value) || 15));
      }).catch(() => undefined);
    } catch {
      await supabase.auth.signOut();
      setGate({ state: "login", notice: "Could not verify your access. Please sign in again." });
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => evaluate(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "MFA_CHALLENGE_VERIFIED") {
        // defer to avoid calling Supabase inside the auth callback
        setTimeout(() => evaluate(session), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [evaluate]);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Idle timeout (policy: admin_idle_timeout_minutes)
  useEffect(() => {
    if (gate.state !== "ready") return;
    let timer = window.setTimeout(expire, idleMinutes * 60_000);
    function expire() {
      supabase.auth.signOut().then(() => setGate({ state: "login", notice: "You were signed out after a period of inactivity." }));
    }
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(expire, idleMinutes * 60_000); };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => { window.clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [gate.state, idleMinutes]);

  if (gate.state === "loading") return <div className="login-wrap"><p className="muted">Loading…</p></div>;
  if (gate.state === "login") return <Login notice={gate.notice} />;
  if (gate.state === "mfa") {
    return <MfaChallenge onDone={() => supabase.auth.getSession().then(({ data }) => evaluate(data.session))}
      onCancel={() => supabase.auth.signOut()} />;
  }

  const go = (p: Page) => { window.location.hash = `#/${p}`; setPage(p); };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand"><span className="logo small">T</span><div><strong>Temo</strong><small>Security Portal</small></div></div>
        <nav>
          {NAV.map(([id, label]) => (
            <button key={id} className={page === id ? "active" : ""} onClick={() => go(id)}>{label}</button>
          ))}
        </nav>
        <div className="side-foot">
          <small>{gate.name}</small>
          <button className="link light" onClick={() => { api.log("logout").finally(() => supabase.auth.signOut()); }}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        {page === "dashboard" && <Dashboard />}
        {page === "users" && <Users meId={gate.userId} flash={flash} />}
        {page === "permissions" && <Permissions flash={flash} />}
        {page === "policies" && <Policies flash={flash} />}
        {page === "audit" && <Audit flash={flash} />}
        {page === "incidents" && <Incidents meId={gate.userId} flash={flash} />}
        {page === "moderation" && <Moderation flash={flash} />}
        {page === "security" && <MySecurity flash={flash} />}
      </main>
      {toast && <div className={`toast ${toast.bad ? "bad" : ""}`} role="status">{toast.msg}</div>}
    </div>
  );
}
