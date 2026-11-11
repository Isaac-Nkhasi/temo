// anchor-order: after an order is completed, hash its immutable snapshot and
// write the hash to the TemoOrderRegistry smart contract, then persist the
// resulting transaction reference in `blockchain_records`.
//
// Called by the app via supabase.functions.invoke("anchor-order", { body: { order_id } }).
// Everything is re-validated server-side (the caller's JWT, order party, and
// completion status) so the client cannot anchor arbitrary data.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { canonicalOrder, sha256Hex, type OrderRow } from "../_shared/order.ts";
import { explorerUrl, orderIdToBytes32, registry, signer } from "../_shared/evm.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Identify the caller from their JWT — never trust the request body.
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Not authenticated" }, 401);
    const callerId = userData.user.id;

    const { order_id } = await req.json().catch(() => ({ order_id: null }));
    if (!order_id) return json({ error: "order_id is required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // 2. Load the order.
    const { data: order, error: orderError } = await admin
      .from("orders").select("*").eq("id", order_id).single();
    if (orderError || !order) return json({ error: "Order not found" }, 404);

    // 3. Authorise: caller must be a party to the order (or an admin).
    const { data: profile } = await admin.from("profiles").select("role").eq("id", callerId).single();
    const isParty = order.buyer_id === callerId || order.seller_id === callerId;
    const isAdmin = profile?.role === "admin";
    if (!isParty && !isAdmin) return json({ error: "Not allowed for this order" }, 403);

    // 4. Only completed orders are anchored.
    if (order.status !== "completed") return json({ error: "Order is not completed yet" }, 409);

    // 5. Hash the immutable snapshot.
    const dataHash = await sha256Hex(canonicalOrder(order as OrderRow));
    const orderId = orderIdToBytes32(order.id);
    const contract = registry(signer());
    const address = await contract.getAddress();
    const chainId = Number(Deno.env.get("CHAIN_ID"));

    // 6. Idempotency: if already anchored with the same hash, do nothing.
    const { data: existing } = await admin
      .from("blockchain_records").select("*").eq("order_id", order.id).maybeSingle();
    if (existing?.status === "confirmed" && existing.data_hash === dataHash) {
      return json({ status: "confirmed", already: true, record: existing, explorer: explorerUrl("tx", existing.tx_hash) });
    }

    // 7. Record a pending row, then submit to the chain.
    await admin.from("blockchain_records").upsert(
      { order_id: order.id, data_hash: dataHash, contract_address: address, chain_id: chainId, status: "pending", error: null },
      { onConflict: "order_id" },
    );

    try {
      const tx = await contract.recordOrder(orderId, dataHash);
      const receipt = await tx.wait();
      const chainRecordId = await contract.recordCount();

      const updated = {
        order_id: order.id,
        data_hash: dataHash,
        tx_hash: receipt.hash,
        contract_address: address,
        chain_id: chainId,
        block_number: receipt.blockNumber,
        chain_record_id: Number(chainRecordId),
        status: "confirmed" as const,
        error: null,
        confirmed_at: new Date().toISOString(),
      };
      const { data: saved, error: saveError } = await admin
        .from("blockchain_records").upsert(updated, { onConflict: "order_id" }).select().single();
      if (saveError) throw saveError;

      return json({ status: "confirmed", already: false, record: saved, explorer: explorerUrl("tx", receipt.hash) });
    } catch (chainError) {
      const message = chainError instanceof Error ? chainError.message : String(chainError);
      await admin.from("blockchain_records")
        .update({ status: "failed", error: message }).eq("order_id", order.id);
      return json({ status: "failed", error: message, data_hash: dataHash }, 502);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
