export type Role = "farmer" | "buyer" | "agri_officer" | "admin";
export type OrderStatus = "pending" | "accepted" | "processing" | "completed" | "cancelled" | "rejected";
export type Category = "Produce" | "Livestock" | "Seeds" | "Equipment";
export type PostTag = "Crops" | "Livestock" | "Weather" | "Question";

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  district: string | null;
  role: Role;
  status: "active" | "suspended" | "pending_verification";
  verified_seller: boolean;
  farm_name: string | null;
  farm_type: string | null;
  farm_description: string | null;
  language: string;
};

export type Product = {
  id: string;
  seller_id: string;
  seller_name: string;
  verified_seller: boolean;
  name: string;
  description: string;
  category: Category;
  price: number;
  unit: string;
  stock: number;
  district: string | null;
  image_url: string | null;
  status?: "active" | "sold_out" | "removed";
  created_at: string;
};

export type Order = {
  id: string;
  product_id: string | null;
  buyer_id: string;
  seller_id: string;
  product_name: string;
  unit: string;
  unit_price: number;
  quantity: number;
  total_amount: number;
  buyer_name: string;
  seller_name: string;
  pickup_district: string | null;
  status: OrderStatus;
  created_at: string;
};

export type FeedPost = {
  id: string;
  author_id: string;
  author_name: string;
  author_district: string | null;
  tag: PostTag;
  body: string;
  image_url: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
};

export type FeedComment = {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export type NewListing = {
  name: string;
  price: number;
  unit: string;
  stock: number;
  district: string;
  category: Category;
  description: string;
  file?: File | null;
};

export type BlockchainRecord = {
  id: string;
  order_id: string;
  data_hash: string;
  tx_hash: string | null;
  contract_address: string | null;
  chain_id: number | null;
  block_number: number | null;
  chain_record_id: number | null;
  status: "pending" | "confirmed" | "failed";
  error: string | null;
  created_at: string;
  confirmed_at: string | null;
};

export type BlockchainVerification = {
  order_id: string;
  stored_data_hash: string | null;
  recomputed_hash: string;
  hash_matches_stored: boolean;
  on_chain_exists: boolean;
  on_chain_data_hash: string | null;
  integrity_ok: boolean;
  tx_hash: string | null;
  explorer: string;
};

export type RiskAdvisory = { probability: number; alert: boolean; advice: string };

/** Day-ahead frost/heat advisory from the crop-advisory edge function. */
export type CropAdvisory = {
  district: string;
  as_of: string;
  forecast: { tomorrow_min_c: number | null; tomorrow_max_c: number | null };
  frost: RiskAdvisory;
  heat: RiskAdvisory;
  model: {
    trained_at: string;
    test_from: string;
    frost_decision_threshold: number;
    heat_decision_threshold: number;
  };
  source: { live_forecast: string; training_data: string };
};
