import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { deleteMyAccount, exportMyData } from "../lib/api";

type Consent = { consent_type: string; policy_version: string; granted: boolean; created_at: string };

export function Privacy({ flash }: { flash: (m: string) => void }) {
  const { profile, signOut } = useAuth();
  const [consents, setConsents] = useState<Consent[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    supabase.from("consent_records").select("consent_type, policy_version, granted, created_at")
      .eq("user_id", profile!.id).order("created_at", { ascending: false })
      .then(({ data }) => setConsents((data ?? []) as Consent[]));
  }, [profile]);

  const download = async () => {
    setBusy(true);
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `temo-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      flash("Your data has been downloaded");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not export your data");
    } finally { setBusy(false); }
  };

  const erase = async () => {
    if (confirmText !== "DELETE") return;
    setBusy(true);
    try {
      await deleteMyAccount();
      await signOut();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not delete your account");
      setBusy(false);
    }
  };

  return (
    <main className="screen">
      <div className="page-heading">
        <p className="eyebrow">YOUR DATA, YOUR CONTROL</p>
        <h1>Privacy & my data</h1>
        <span>How Temo handles your personal information.</span>
      </div>

      <section className="privacy-card">
        <h3>Privacy notice</h3>
        <p>Temo stores only what it needs to run your account and the marketplace:</p>
        <ul>
          <li><b>Identity & contact:</b> name, email, phone, district — never shown to other users except your name and district.</li>
          <li><b>Farm & marketplace:</b> farm details, listings, orders and saved products.</li>
          <li><b>Community:</b> posts, replies and likes.</li>
          <li><b>Security:</b> an audit trail of important account events, kept for administrators.</li>
        </ul>
        <p>Completed order records may be kept in anonymised form after deletion for accounting and traceability.</p>
      </section>

      <section className="privacy-card">
        <h3>Your consent</h3>
        {consents.length ? consents.map((c) => (
          <div className="consent-row" key={c.created_at}>
            <span>{c.consent_type.replace(/_/g, " ")} (v{c.policy_version})</span>
            <span>{c.granted ? "Granted" : "Withdrawn"} · {new Date(c.created_at).toLocaleDateString("en-GB")}</span>
          </div>
        )) : <p>No consent record found.</p>}
      </section>

      <section className="privacy-card">
        <h3>Download my data</h3>
        <p>Get a copy of everything Temo holds about you (profile, listings, posts, orders…) as a JSON file.</p>
        <button onClick={download} disabled={busy}>{busy ? "Preparing…" : "Download my data"}</button>
      </section>

      <section className="privacy-card">
        <h3>Correct my data</h3>
        <p>Update your name, phone, district and farm details any time from <b>Profile → Edit farm profile</b>.</p>
      </section>

      <section className="privacy-card danger">
        <h3>Delete my account</h3>
        <p>This removes your listings, posts and replies, clears your personal details and disables your login. It cannot be undone.
          You must have no open orders.</p>
        <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder='Type DELETE to confirm' aria-label="Type DELETE to confirm" />
        <button onClick={erase} disabled={busy || confirmText !== "DELETE"}>Delete my account</button>
      </section>
    </main>
  );
}
