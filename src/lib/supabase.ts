import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False until the .env file has been filled in – the app shows a setup screen instead of crashing. */
export const isConfigured = Boolean(url && key);

export const supabase = createClient(url || "http://localhost:54321", key || "missing-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
