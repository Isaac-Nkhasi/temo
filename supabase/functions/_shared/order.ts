// Canonical, deterministic snapshot of an order, used for the on-chain hash.
//
// Only the immutable "snapshot" columns are included. Mutable fields such as
// `status` are deliberately excluded, so the hash of a completed order never
// changes after it has been anchored. No personal data beyond what the order
// already snapshots is added.

export type OrderRow = {
  id: string;
  product_id: string | null;
  buyer_id: string;
  seller_id: string;
  product_name: string;
  unit: string;
  unit_price: number | string;
  quantity: number;
  total_amount: number | string;
  buyer_name: string;
  seller_name: string;
  pickup_district: string | null;
  created_at: string;
};

function money(value: number | string): string {
  return Number(value).toFixed(2);
}

/** Stable JSON: fixed key order (alphabetical) + normalised numbers. */
export function canonicalOrder(order: OrderRow): string {
  const snapshot: Record<string, unknown> = {
    order_id: order.id,
    product_id: order.product_id,
    buyer_id: order.buyer_id,
    seller_id: order.seller_id,
    product_name: order.product_name,
    unit: order.unit,
    unit_price: money(order.unit_price),
    quantity: order.quantity,
    total_amount: money(order.total_amount),
    buyer_name: order.buyer_name,
    seller_name: order.seller_name,
    pickup_district: order.pickup_district,
    created_at: order.created_at,
  };
  const ordered = Object.keys(snapshot).sort();
  return JSON.stringify(snapshot, ordered);
}

/** sha256 of the canonical snapshot, as a 0x-prefixed 32-byte hex string. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return "0x" + hex;
}
