import { useState } from "react";
import { Icon } from "../components/Icon";
import { useAuth } from "../auth/AuthProvider";
import { placeOrder } from "../lib/api";
import { initials, money } from "../lib/format";
import { productImage } from "../lib/images";
import type { Product } from "../lib/types";

export function ProductDetail({
  product, onBack, onOrdered, flash,
}: {
  product: Product; onBack: () => void; onOrdered: () => void; flash: (msg: string) => void;
}) {
  const { profile, can } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [ordered, setOrdered] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOwn = product.seller_id === profile?.id;
  const canBuy = !isOwn && can("marketplace", "write") && product.stock > 0;

  const buy = async () => {
    setBusy(true);
    try {
      await placeOrder(product.id, quantity);
      setOrdered(true);
      onOrdered();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not place order");
    } finally { setBusy(false); }
  };

  return (
    <main className="product-detail">
      <div className="detail-photo">
        <img src={productImage(product.image_url)} alt={product.name} />
        <button className="detail-back" onClick={onBack} aria-label="Back to marketplace"><Icon name="back" size={23} /></button>
      </div>
      <div className="detail-content">
        <div className="detail-labels">
          <span>{product.category}</span>
          {product.verified_seller && (
            <span className="verified"><Icon name="check" size={12} /> Verified seller</span>
          )}
        </div>
        <h1>{product.name}</h1>
        <div className="detail-price">
          <strong>{money(product.price)}</strong>
          <span>{product.unit ? `/ ${product.unit}` : ""}</span>
        </div>
        <div className="detail-seller">
          <div className="avatar alt">{initials(product.seller_name)}</div>
          <div>
            <strong>{product.seller_name}</strong>
            <span><Icon name="pin" size={13} /> {product.district ?? "Lesotho"}, Lesotho</span>
          </div>
          <button onClick={() => flash("Direct messaging is coming soon")}><Icon name="message" size={18} /> Message</button>
        </div>
        <section className="detail-section">
          <h2>About this product</h2>
          <p>{product.description || "No description provided."}</p>
        </section>
        <div className="availability">
          <Icon name="check" size={18} />
          <div>
            <strong>{product.stock > 0 ? "Available now" : "Out of stock"}</strong>
            <span>{product.stock} in stock · Pickup in {product.district ?? "Lesotho"}</span>
          </div>
        </div>
        {ordered ? (
          <div className="order-confirmation">
            <span><Icon name="check" size={26} /></span>
            <div>
              <strong>Order request sent</strong>
              <p>{product.seller_name} will review it. Track it under Profile → My orders.</p>
            </div>
          </div>
        ) : isOwn ? (
          <div className="order-note">This is your own listing.</div>
        ) : canBuy ? (
          <div className="buy-bar">
            <div className="quantity">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
              <span>{quantity}</span>
              <button onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}>+</button>
            </div>
            <button className="buy-button" onClick={buy} disabled={busy}>
              <Icon name="cart" size={18} /> {busy ? "Sending…" : `Order · ${money(product.price * quantity)}`}
            </button>
          </div>
        ) : (
          <div className="order-note">{product.stock <= 0 ? "This item is sold out." : "Your account type cannot place orders."}</div>
        )}
      </div>
    </main>
  );
}
