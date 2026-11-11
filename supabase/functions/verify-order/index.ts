// verify-order: integrity check for one order.
// Recomputes the hash of the order snapshot from the database and asks the
// smart contract whether that exact hash is anchored on-chain. This is what
// the app's "Verify" button calls.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { canonicalOrder, sha256Hex, type OrderRow } from "../_shared/order.ts";
import { explorerUrl, orderIdToBytes32, provider, registry } from "../_shared/evm.ts";

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
    const { data: order, error: orderError } = await admin
      .from("orders").select("*").eq("id", order_id).single();
    if (orderError || !order) return json({ error: "Order not found" }, 404);

    const { data: profile } = await admin.from("profiles").select("role").eq("id", callerId).single();
    const isParty = order.buyer_id === callerId || order.seller_id === callerId;
    const isAdmin = profile?.role === "admin";
    const isOfficer = profile?.role === "agri_officer";
    if (!isParty && !isAdmin && !isOfficer) return json({ error: "Not allowed for this order" }, 403);

    const { data: record } = await admin
      .from("blockchain_records").select("*").eq("order_id", order.id).maybeSingle();

    // Recompute the hash from the current database row.
    const recomputedHash = await sha256Hex(canonicalOrder(order as OrderRow));
    const orderId = orderIdToBytes32(order.id);
    const contract = registry(provider());

    const [dataHash, recordedAt, recordedBy, exists] = await contract.getRecord(orderId);
    const integrityOk = exists ? await contract.verify(orderId, recomputedHash) : false;

    return json({
      order_id: order.id,
      stored_data_hash: record?.data_hash ?? null,
      recomputed_hash: recomputedHash,
      // Does the hash we compute now still equal what the DB stored at anchor time?
      hash_matches_stored: record?.data_hash ? record.data_hash === recomputedHash : false,
      // Is the record present on-chain and does its hash match the live snapshot?
      on_chain_exists: Boolean(exists),
      on_chain_data_hash: exists ? dataHash : null,
      on_chain_recorded_at: exists ? Number(recordedAt) : null,
      on_chain_recorded_by: exists ? recordedBy : null,
      integrity_ok: integrityOk,
      tx_hash: record?.tx_hash ?? null,
      contract_address: record?.contract_address ?? null,
      chain_id: record?.chain_id ?? null,
      explorer: record?.tx_hash ? explorerUrl("tx", record.tx_hash) : "",
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
