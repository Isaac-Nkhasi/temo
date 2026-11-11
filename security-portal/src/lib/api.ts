import { supabase } from "./supabase";

export type Role = "farmer" | "buyer" | "agri_officer" | "admin";
export type Status = "active" | "suspended" | "pending_verification";
export const ROLES: Role[] = ["farmer", "buyer", "agri_officer", "admin"];
export const ROLE_LABEL: Record<Role, string> = {
  farmer: "Farmer", buyer: "Buyer", agri_officer: "Agri officer", admin: "Admin",
};

export type AdminUser = {
  id: string; email: string; full_name: string; phone: string | null; district: string | null;
  role: Role; status: Status; verified_seller: boolean; farm_name: string | null;
  created_at: string; last_sign_in_at: string | null; deleted_at: string | null;
};
export type Permission = { role: Role; module: string; can_read: boolean; can_write: boolean; scope: string };
export type Policy = { key: string; value: unknown; description: string; updated_at: string };
export type AuditRow = {
  id: number; actor_id: string | null; action: string; entity: string | null;
  entity_id: string | null; metadata: Record<string, unknown>; created_at: string;
};
export type Incident = {
  id: string; title: string; description: string; severity: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "contained" | "resolved"; personal_data_involved: boolean;
  detected_at: string; authority_notified_at: string | null; resolved_at: string | null; created_at: string;
};
export type ModPost = { id: string; author_name: string; body: string; tag: string; hidden: boolean; created_at: string };

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const api = {
  async profile(userId: string): Promise<{ id: string; full_name: string; role: Role; status: Status } | null> {
    return check(await supabase.from("profiles").select("id, full_name, role, status").eq("id", userId).maybeSingle()) as
      { id: string; full_name: string; role: Role; status: Status } | null;
  },
  async dashboard(): Promise<Record<string, any>> {
    return check(await supabase.rpc("admin_dashboard"));
  },
  async users(): Promise<AdminUser[]> {
    return check(await supabase.rpc("admin_list_users")) ?? [];
  },
  async updateUser(id: string, role: Role, status: Status, verified: boolean) {
    return check(await supabase.rpc("admin_update_user", { p_user: id, p_role: role, p_status: status, p_verified: verified }));
  },
  async permissions(): Promise<Permission[]> {
    return (check(await supabase.from("role_permissions").select("*").order("module")) ?? []) as Permission[];
  },
  async setPermission(role: Role, module: string, patch: Partial<Pick<Permission, "can_read" | "can_write" | "scope">>) {
    check(await supabase.from("role_permissions").update(patch).eq("role", role).eq("module", module).select());
  },
  async policies(): Promise<Policy[]> {
    return (check(await supabase.from("security_policies").select("*").order("key")) ?? []) as Policy[];
  },
  async setPolicy(key: string, value: unknown) {
    check(await supabase.from("security_policies").update({ value }).eq("key", key).select());
  },
  async audit(limit = 500): Promise<AuditRow[]> {
    return (check(await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit)) ?? []) as AuditRow[];
  },
  async incidents(): Promise<Incident[]> {
    return (check(await supabase.from("security_incidents").select("*").order("detected_at", { ascending: false })) ?? []) as Incident[];
  },
  async addIncident(i: { title: string; description: string; severity: string; personal_data_involved: boolean; reported_by: string }) {
    check(await supabase.from("security_incidents").insert(i).select());
  },
  async updateIncident(id: string, patch: Partial<Incident>) {
    check(await supabase.from("security_incidents").update(patch).eq("id", id).select());
  },
  async posts(): Promise<ModPost[]> {
    return check(await supabase.rpc("admin_list_posts", { p_limit: 200 })) ?? [];
  },
  async setPostHidden(id: string, hidden: boolean) {
    check(await supabase.rpc("admin_set_post_hidden", { p_post: id, p_hidden: hidden }));
  },
  async log(action: string, metadata: Record<string, unknown> = {}) {
    await supabase.rpc("portal_log", { p_action: action, p_metadata: metadata });
  },
};

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
