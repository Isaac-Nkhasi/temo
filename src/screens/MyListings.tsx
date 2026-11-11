import { useCallback, useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { useAuth } from "../auth/AuthProvider";
import { fetchMyListings, removeListing } from "../lib/api";
import { money } from "../lib/format";
import { productImage } from "../lib/images";
import type { Product } from "../lib/types";

export function MyListings({ flash, onChanged }: { flash: (m: string) => void; onChanged: () => void }) {
  const { profile } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setItems(await fetchMyListings(profile!.id)); }
    catch (e) { flash(e instanceof Error ? e.message : "Could not load listings"); }
    finally { setLoading(false); }
  }, [profile, flash]);
  useEffect(() => { load(); }, [load]);

  const remove = async (p: Product) => {
    if (!window.confirm(`Remove "${p.name}" from the marketplace?`)) return;
    try { await removeListing(p.id); await load(); onChanged(); flash("Listing removed"); }
    catch (e) { flash(e instanceof Error ? e.message : "Could not remove listing"); }
  };

  return (
    <main className="screen">
      <div className="page-heading">
        <p className="eyebrow">YOUR STOCK</p>
        <h1>My listings</h1>
        <span>Manage what you sell on the marketplace.</span>
      </div>
      <div className="order-list">
        {items.map((p) => (
          <article className="order-card listing-row" key={p.id}>
            <img src={productImage(p.image_url)} alt="" />
            <div>
              <strong>{p.name}</strong>
              <p className="order-meta">{money(p.price)}{p.unit ? ` / ${p.unit}` : ""} · {p.stock} in stock</p>
              <p className="order-meta"><em className={`status ${p.status === "active" ? "completed" : "cancelled"}`}>
                {p.status === "active" ? "Live" : "Sold out"}</em> · {p.district}</p>
            </div>
            <button className="ghost" onClick={() => remove(p)} aria-label={`Remove ${p.name}`}><Icon name="close" size={16} /></button>
          </article>
        ))}
        {!loading && !items.length && (
          <div className="empty"><Icon name="store" size={30} /><h3>No listings yet</h3><p>Use Sell on the Market tab to add one.</p></div>
        )}
      </div>
    </main>
  );
}
