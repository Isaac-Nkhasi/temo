import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { ProductCard } from "../components/ProductCard";
import { useAuth } from "../auth/AuthProvider";
import type { Product } from "../lib/types";

export function Market({
  products, savedIds, onToggleSave, onSell, onSelectProduct,
}: {
  products: Product[]; savedIds: string[]; onToggleSave: (p: Product) => void;
  onSell: () => void; onSelectProduct: (p: Product) => void;
}) {
  const { profile, districts, can } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [district, setDistrict] = useState("All");
  const canSell = (profile?.role === "farmer" || profile?.role === "admin") && can("marketplace", "write");

  const filtered = useMemo(
    () => products.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) &&
      (category === "All" || p.category === category) &&
      (district === "All" || p.district === district)),
    [category, district, products, query],
  );

  return (
    <main className="screen">
      <div className="market-heading">
        <div className="page-heading">
          <p className="eyebrow">LOCAL & TRUSTED</p>
          <h1>Marketplace</h1>
          <span>Buy and sell directly with farmers.</span>
        </div>
        {canSell && (
          <button className="sell-button" onClick={onSell}><Icon name="plus" size={18} /> Sell</button>
        )}
      </div>
      <label className="search">
        <Icon name="search" size={20} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search produce, livestock..." />
      </label>
      <div className="chips market-chips">
        {["All", "Produce", "Livestock", "Seeds", "Equipment"].map((item) => (
          <button key={item} onClick={() => setCategory(item)} className={category === item ? "active" : ""}>{item}</button>
        ))}
      </div>
      <div className="market-summary">
        <span><strong>{filtered.length}</strong> {filtered.length === 1 ? "listing" : "listings"}</span>
        <label className="district-filter">
          <Icon name="pin" size={16} />
          <select value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="Filter by district">
            <option value="All">All districts</option>
            {districts.map((d) => <option key={d.name}>{d.name}</option>)}
          </select>
        </label>
      </div>
      <div className="product-grid">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} saved={savedIds.includes(product.id)}
            onToggleSave={onToggleSave} onSelect={onSelectProduct} />
        ))}
      </div>
      {!filtered.length && (
        <div className="empty"><Icon name="search" size={30} /><h3>No listings found</h3><p>Try another crop, product or district.</p></div>
      )}
    </main>
  );
}
