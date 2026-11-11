import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { useAuth } from "../auth/AuthProvider";
import { anchorOrder, changeOrderStatus, fetchBlockchainRecords, verifyOrder } from "../lib/api";
import { money, STATUS_LABEL, timeAgo } from "../lib/format";
import type { BlockchainRecord, Order, OrderStatus } from "../lib/types";

const shortHash = (hash: string | null | undefined) =>
  hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : "—";

function explorerTx(record: BlockchainRecord): string | null {
  if (!record.tx_hash) return null;
  if (record.chain_id === 11155111) return `https://sepolia.etherscan.io/tx/${record.tx_hash}`;
  if (record.chain_id === 80002) return `https://amoy.polygonscan.com/tx/${record.tx_hash}`;
  return null;
}

export function Orders({ orders, reload, flash }: { orders: Order[]; reload: () => Promise<void>; flash: (m: string) => void }) {
  const { profile } = useAuth();
  const uid = profile!.id;
  const [view, setView] = useState<"buying" | "selling">("buying");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [chain, setChain] = useState<Record<string, BlockchainRecord>>({});
  const [chainBusy, setChainBusy] = useState<string | null>(null);

  const mine = orders.filter((o) => (view === "buying" ? o.buyer_id === uid : o.seller_id === uid));
  const pendingSelling = orders.filter((o) => o.seller_id === uid && o.status === "pending").length;

  // Reload on-chain status whenever the set of completed orders changes.
  const completedKey = orders.filter((o) => o.status === "completed").map((o) => o.id).sort().join(",");
  useEffect(() => {
    const ids = orders.filter((o) => o.status === "completed").map((o) => o.id);
    if (!ids.length) { setChain({}); return; }
    fetchBlockchainRecords(ids).then(setChain).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedKey]);

  const loadChain = async (orderId: string) => {
    const map = await fetchBlockchainRecords([orderId]);
    setChain((c) => ({ ...c, ...map }));
  };

  const anchor = async (order: Order) => {
    setChainBusy(order.id);
    try {
      const res = await anchorOrder(order.id);
      await loadChain(order.id);
      flash(res.status === "confirmed" ? "Order anchored on the blockchain" : "Blockchain anchoring did not succeed");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not anchor order");
    } finally { setChainBusy(null); }
  };

  const verify = async (order: Order) => {
    setChainBusy(order.id);
    try {
      const res = await verifyOrder(order.id);
      flash(res.integrity_ok ? "Verified ✓ the record matches the blockchain" : "Verification failed – the record does not match the blockchain");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not verify order");
    } finally { setChainBusy(null); }
  };

  const act = async (order: Order, status: OrderStatus, message: string) => {
    setBusyId(order.id);
    try {
      await changeOrderStatus(order.id, status);
      await reload();
      flash(message);
      if (status === "completed") void anchor(order);   // anchor the receipt on-chain
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not update order");
    } finally { setBusyId(null); }
  };

  return (
    <main className="screen">
      <div className="page-heading">
        <p className="eyebrow">TRACK YOUR TRADES</p>
        <h1>My orders</h1>
        <span>Pending → Accepted → Processing → Completed</span>
      </div>
      <div className="chips">
        <button className={view === "buying" ? "active" : ""} onClick={() => setView("buying")}>Buying</button>
        <button className={view === "selling" ? "active" : ""} onClick={() => setView("selling")}>
          Selling{pendingSelling ? ` (${pendingSelling} new)` : ""}
        </button>
      </div>
      <div className="order-list">
        {mine.map((o) => {
          const seller = o.seller_id === uid;
          const busy = busyId === o.id;
          const rec = chain[o.id];
          const txUrl = rec ? explorerTx(rec) : null;
          return (
            <article className="order-card" key={o.id}>
              <div className="order-top">
                <strong>{o.product_name}</strong>
                <em className={`status ${o.status}`}>{STATUS_LABEL[o.status]}</em>
              </div>
              <p className="order-meta">
                {o.quantity} × {money(o.unit_price)}{o.unit ? ` / ${o.unit}` : ""} · <b>{money(o.total_amount)}</b>
              </p>
              <p className="order-meta">
                {seller ? `Buyer: ${o.buyer_name}` : `Seller: ${o.seller_name}`} · {timeAgo(o.created_at)}
                {o.pickup_district ? ` · Pickup ${o.pickup_district}` : ""}
              </p>
              <div className="order-actions">
                {seller && o.status === "pending" && (
                  <>
                    <button disabled={busy} onClick={() => act(o, "accepted", "Order accepted")}>Accept</button>
                    <button className="ghost" disabled={busy} onClick={() => act(o, "rejected", "Order rejected")}>Reject</button>
                  </>
                )}
                {seller && o.status === "accepted" && (
                  <button disabled={busy} onClick={() => act(o, "processing", "Marked as ready for pickup")}>Ready for pickup</button>
                )}
                {seller && (o.status === "accepted" || o.status === "processing") && (
                  <button className="ghost" disabled={busy} onClick={() => act(o, "cancelled", "Order cancelled")}>Cancel</button>
                )}
                {!seller && o.status === "processing" && (
                  <button disabled={busy} onClick={() => act(o, "completed", "Receipt confirmed – order completed")}>
                    <Icon name="check" size={15} /> Confirm receipt
                  </button>
                )}
                {!seller && o.status === "pending" && (
                  <button className="ghost" disabled={busy} onClick={() => act(o, "cancelled", "Order cancelled")}>Cancel order</button>
                )}
              </div>
              {o.status === "completed" && (
                <div className="chain-line">
                  {rec?.status === "confirmed" ? (
                    <>
                      <span className="chain-badge ok">On-chain ✓</span>
                      {txUrl ? (
                        <a className="chain-hash" href={txUrl} target="_blank" rel="noreferrer">{shortHash(rec.tx_hash)}</a>
                      ) : (
                        <code className="chain-hash">{shortHash(rec.tx_hash)}</code>
                      )}
                      <button disabled={chainBusy === o.id} onClick={() => verify(o)}>Verify</button>
                    </>
                  ) : rec?.status === "pending" ? (
                    <span className="chain-badge">Anchoring…</span>
                  ) : rec?.status === "failed" ? (
                    <>
                      <span className="chain-badge fail">Not anchored</span>
                      <button disabled={chainBusy === o.id} onClick={() => anchor(o)}>Retry</button>
                    </>
                  ) : (
                    <>
                      <span className="chain-badge">Not on chain</span>
                      <button disabled={chainBusy === o.id} onClick={() => anchor(o)}>Anchor on-chain</button>
                    </>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {!mine.length && (
          <div className="empty"><Icon name="cart" size={30} /><h3>No orders yet</h3>
            <p>{view === "buying" ? "Orders you place will appear here." : "Orders from buyers will appear here."}</p></div>
        )}
      </div>
    </main>
  );
}
