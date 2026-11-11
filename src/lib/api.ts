import { supabase } from "./supabase";
import type {
  BlockchainRecord, BlockchainVerification, CropAdvisory, FeedComment, FeedPost, NewListing, Order, OrderStatus,
  PostTag, Product, Profile,
} from "./types";

function friendly(message: string): string {
  if (/row-level security|permission denied/i.test(message)) {
    return "You don't have permission to do that. An administrator may have changed your access.";
  }
  if (/Database error saving new user/i.test(message)) {
    return "Registration is currently closed or unavailable. Please try again later.";
  }
  return message;
}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(friendly(error.message));
}

/* ------------------------------ districts ------------------------------ */
export type District = { name: string; latitude: number; longitude: number };

export async function fetchDistricts(): Promise<District[]> {
  const { data, error } = await supabase.from("districts").select("*").order("name");
  fail(error);
  return (data ?? []).map((d) => ({ ...d, latitude: Number(d.latitude), longitude: Number(d.longitude) }));
}

/* ------------------------------- profile -------------------------------- */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  fail(error);
  return data as Profile | null;
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<Profile, "full_name" | "phone" | "district" | "farm_name" | "farm_type" | "farm_description" | "language">>,
): Promise<Profile> {
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", userId).select().single();
  fail(error);
  return data as Profile;
}

export async function fetchMyStats(): Promise<{ posts: number; listings: number; helpful_votes: number }> {
  const { data, error } = await supabase.rpc("my_stats");
  fail(error);
  return data as { posts: number; listings: number; helpful_votes: number };
}

/* ------------------------------ marketplace ----------------------------- */
const num = (p: Product): Product => ({ ...p, price: Number(p.price) });

export async function fetchListings(): Promise<Product[]> {
  const { data, error } = await supabase.from("market_listings").select("*").order("created_at", { ascending: false });
  fail(error);
  return ((data ?? []) as Product[]).map(num);
}

export async function fetchMyListings(userId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products").select("*").eq("seller_id", userId).neq("status", "removed")
    .order("created_at", { ascending: false });
  fail(error);
  return ((data ?? []) as Product[]).map(num);
}

async function uploadImage(userId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, {
    contentType: file.type, upsert: false,
  });
  fail(error);
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

export async function createListing(userId: string, input: NewListing): Promise<void> {
  const image_url = input.file ? await uploadImage(userId, input.file) : null;
  const { error } = await supabase.from("products").insert({
    seller_id: userId,
    name: input.name.trim(),
    description: input.description.trim(),
    category: input.category,
    price: input.price,
    unit: input.unit.trim(),
    stock: input.stock,
    district: input.district,
    image_url,
  });
  fail(error);
}

export async function removeListing(productId: string): Promise<void> {
  const { error } = await supabase.from("products").update({ status: "removed" }).eq("id", productId);
  fail(error);
}

export async function fetchSavedIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("product_saves").select("product_id").eq("user_id", userId);
  fail(error);
  return (data ?? []).map((r) => r.product_id as string);
}

export async function setSaved(userId: string, productId: string, saved: boolean): Promise<void> {
  const q = saved
    ? supabase.from("product_saves").insert({ user_id: userId, product_id: productId })
    : supabase.from("product_saves").delete().eq("user_id", userId).eq("product_id", productId);
  const { error } = await q;
  fail(error);
}

/* -------------------------------- orders -------------------------------- */
export async function placeOrder(productId: string, quantity: number): Promise<Order> {
  const { data, error } = await supabase.rpc("place_order", { p_product_id: productId, p_quantity: quantity });
  fail(error);
  return data as Order;
}

export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
  fail(error);
  return ((data ?? []) as Order[]).map((o) => ({
    ...o, unit_price: Number(o.unit_price), total_amount: Number(o.total_amount),
  }));
}

export async function changeOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
  const { data, error } = await supabase.rpc("set_order_status", { p_order_id: orderId, p_status: status });
  fail(error);
  return data as Order;
}

/* ------------------------------ blockchain ------------------------------ */
/** On-chain anchoring rows for the given orders (RLS: only order parties read). */
export async function fetchBlockchainRecords(orderIds: string[]): Promise<Record<string, BlockchainRecord>> {
  if (!orderIds.length) return {};
  const { data, error } = await supabase.from("blockchain_records").select("*").in("order_id", orderIds);
  fail(error);
  const map: Record<string, BlockchainRecord> = {};
  for (const row of (data ?? []) as BlockchainRecord[]) map[row.order_id] = row;
  return map;
}

/** Submit a completed order's hash to the registry (server re-validates everything). */
export async function anchorOrder(orderId: string): Promise<{ status: string; explorer?: string }> {
  const { data, error } = await supabase.functions.invoke("anchor-order", { body: { order_id: orderId } });
  if (error) throw new Error(friendly(error.message) || "Could not anchor the order");
  return data as { status: string; explorer?: string };
}

/** Recompute the order hash and confirm it matches the on-chain record. */
export async function verifyOrder(orderId: string): Promise<BlockchainVerification> {
  const { data, error } = await supabase.functions.invoke("verify-order", { body: { order_id: orderId } });
  if (error) throw new Error(friendly(error.message) || "Could not verify the order");
  return data as BlockchainVerification;
}

/* --------------------------- AI / crop advisory -------------------------- */
/** Day-ahead frost/heat advisory for a district, scored by the trained model. */
export async function getCropAdvisory(district: string): Promise<CropAdvisory> {
  const { data, error } = await supabase.functions.invoke("crop-advisory", { body: { district } });
  if (error) throw new Error(friendly(error.message) || "Could not load the farm advisory");
  if (data?.error) throw new Error(friendly(String(data.error)));
  return data as CropAdvisory;
}

/* ------------------------------- community ------------------------------ */
export async function fetchFeed(): Promise<FeedPost[]> {
  const { data, error } = await supabase.from("community_feed").select("*").order("created_at", { ascending: false }).limit(100);
  fail(error);
  return (data ?? []) as FeedPost[];
}

export async function createPost(userId: string, body: string, tag: PostTag = "Question"): Promise<void> {
  const { error } = await supabase.from("posts").insert({ author_id: userId, body: body.trim(), tag });
  fail(error);
}

export async function setLike(userId: string, postId: string, liked: boolean): Promise<void> {
  const q = liked
    ? supabase.from("post_likes").insert({ post_id: postId, user_id: userId })
    : supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
  const { error } = await q;
  fail(error);
}

export async function fetchComments(postId: string): Promise<FeedComment[]> {
  const { data, error } = await supabase.from("comments_feed").select("*").eq("post_id", postId).order("created_at");
  fail(error);
  return (data ?? []) as FeedComment[];
}

export async function addComment(userId: string, postId: string, body: string): Promise<void> {
  const { error } = await supabase.from("comments").insert({ post_id: postId, author_id: userId, body: body.trim() });
  fail(error);
}

/* ------------------------- permissions & privacy ------------------------ */
export type Permission = { module: string; can_read: boolean; can_write: boolean; scope: string };

export async function fetchMyPermissions(role: string): Promise<Permission[]> {
  const { data, error } = await supabase.from("role_permissions").select("module, can_read, can_write, scope").eq("role", role);
  fail(error);
  return (data ?? []) as Permission[];
}

/** GDPR Art. 15 / 20 – everything Temo holds about the signed-in user, as JSON. */
export async function exportMyData(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("export_my_data");
  fail(error);
  return data as Record<string, unknown>;
}

/** GDPR Art. 17 – anonymises the profile, deletes user content and disables the login. */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc("delete_my_account");
  fail(error);
}
