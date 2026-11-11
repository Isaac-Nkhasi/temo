import { Icon } from "../components/Icon";
import { ProductCard } from "../components/ProductCard";
import type { Product } from "../lib/types";

export function SavedProducts({
  products, savedIds, onToggleSave, onSelect,
}: { products: Product[]; savedIds: string[]; onToggleSave: (p: Product) => void; onSelect: (p: Product) => void }) {
  const saved = products.filter((p) => savedIds.includes(p.id));
  return (
    <main className="screen">
      <div className="page-heading">
        <p className="eyebrow">YOUR SHORTLIST</p>
        <h1>Saved products</h1>
        <span>Items you’ve hearted in the marketplace.</span>
      </div>
      <div className="product-grid">
        {saved.map((p) => <ProductCard key={p.id} product={p} saved onToggleSave={onToggleSave} onSelect={onSelect} />)}
      </div>
      {!saved.length && (
        <div className="empty"><Icon name="heart" size={30} /><h3>Nothing saved yet</h3><p>Tap the heart on a product to save it.</p></div>
      )}
    </main>
  );
}
