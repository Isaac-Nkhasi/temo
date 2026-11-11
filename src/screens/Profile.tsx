import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { useAuth } from "../auth/AuthProvider";
import { fetchMyStats } from "../lib/api";
import { initials, ROLE_LABEL } from "../lib/format";

export type SubView = "saved" | "listings" | "orders" | "privacy" | null;

export function Profile({
  openSub, onEdit, flash, statsVersion,
}: { openSub: (v: Exclude<SubView, null>) => void; onEdit: () => void; flash: (m: string) => void; statsVersion: number }) {
  const { profile, signOut, session } = useAuth();
  const [stats, setStats] = useState({ posts: 0, listings: 0, helpful_votes: 0 });
  useEffect(() => { fetchMyStats().then(setStats).catch(() => undefined); }, [statsVersion]);

  if (!profile) return null;
  const canSell = profile.role === "farmer" || profile.role === "admin";
  const items: [string, () => void][] = [
    ["Saved products", () => openSub("saved")],
    ...(canSell ? ([["My marketplace listings", () => openSub("listings")]] as [string, () => void][]) : []),
    ["My orders", () => openSub("orders")],
    ["Language & district", onEdit],
    ["Privacy & my data", () => openSub("privacy")],
    ["Help and support", () => flash("Help centre coming soon")],
  ];

  return (
    <main className="screen profile">
      <div className="profile-cover"><div className="avatar profile-avatar">{initials(profile.full_name)}</div></div>
      <h1>{profile.full_name}</h1>
      <p><Icon name="pin" size={15} /> {profile.district ?? "Lesotho"}, Lesotho</p>
      <p className="role-chip">{ROLE_LABEL[profile.role]}{profile.verified_seller ? " · Verified seller" : ""}</p>
      <div className="profile-stats">
        <div><strong>{stats.posts}</strong><span>Posts</span></div>
        <div><strong>{stats.listings}</strong><span>Listings</span></div>
        <div><strong>{stats.helpful_votes}</strong><span>Helpful votes</span></div>
      </div>
      {(profile.role === "farmer" || profile.farm_name) && (
        <section className="farm-card">
          <span>MY FARM</span>
          <h2>{profile.farm_name || "Add your farm"}</h2>
          <p>{profile.farm_description || profile.farm_type || "Tell buyers about your farm"}</p>
          <button onClick={onEdit}>Edit farm profile</button>
        </section>
      )}
      <div className="settings">
        {items.map(([label, fn]) => (
          <button key={label} onClick={fn}><span>{label}</span><Icon name="arrow" size={18} /></button>
        ))}
      </div>
      <p className="account-email">{session?.user.email}</p>
      <button className="signout" onClick={() => signOut()}>Log out</button>
    </main>
  );
}
