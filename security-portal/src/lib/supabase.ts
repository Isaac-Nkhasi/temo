import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isConfigured = Boolean(url && key);

// Own storage key => this origin never shares a session with the farmer app.
export const supabase = createClient(url || "http://localhost:54321", key || "missing-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "temo-security-portal-auth" },
});
