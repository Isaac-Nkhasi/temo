import { Icon } from "./Icon";
import { money } from "../lib/format";
import { productImage } from "../lib/images";
import type { Product } from "../lib/types";

export function ProductCard({
  product, saved, onToggleSave, onSelect,
}: {
  product: Product; saved: boolean; onToggleSave: (product: Product) => void; onSelect: (product: Product) => void;
}) {
  return (
    <article
      className="product-card"
      onClick={() => onSelect(product)}
      onKeyDown={(event) => event.key === "Enter" && onSelect(product)}
      role="button"
      tabIndex={0}
      aria-label={`View ${product.name}`}
    >
      <div className="product-image">
        <img src={productImage(product.image_url)} alt={product.name} />
        <button
          onClick={(event) => { event.stopPropagation(); onToggleSave(product); }}
          className={saved ? "saved" : ""}
          aria-label={saved ? "Remove from saved" : "Save product"}
        >
          <Icon name="heart" size={18} filled={saved} />
        </button>
      </div>
      <div className="product-info">
        <h3>{product.name}</h3>
        <p>{product.seller_name}</p>
        <div className="place"><Icon name="pin" size={13} /> {product.district ?? "Lesotho"}</div>
        <div className="price">
          <strong>{money(product.price)}</strong>
          <span>{product.unit ? `/ ${product.unit}` : ""}</span>
        </div>
      </div>
    </article>
  );
}
