import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { District, Permission, fetchDistricts, fetchMyPermissions, fetchProfile, updateProfile } from "../lib/api";
import type { Profile, Role } from "../lib/types";

export type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  district: string;
  role: Extract<Role, "farmer" | "buyer">;
  farmName: string;
  farmType: string;
};

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  districts: District[];
  loading: boolean;
  /** Mirrors the role_permissions matrix. The database enforces it; this only shapes the UI. */
  can: (module: string, action: "read" | "write") => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  saveProfile: (patch: Parameters<typeof updateProfile>[1]) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Permission[]>([]);

  useEffect(() => {
    fetchDistricts().then(setDistricts).catch(() => setDistricts([]));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    fetchProfile(userId)
      .then((p) => !cancelled && setProfile(p))
      .catch(() => !cancelled && setProfile(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const role = profile?.role;
  useEffect(() => {
    if (!role) { setPermissions([]); return; }
    fetchMyPermissions(role).then(setPermissions).catch(() => setPermissions([]));
  }, [role]);

  const can = useCallback(
    (module: string, action: "read" | "write") => {
      if (role === "admin") return true;
      const row = permissions.find((p) => p.module === module);
      return !!row && (action === "read" ? row.can_read : row.can_write);
    },
    [permissions, role],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          full_name: input.fullName,
          phone: input.phone,
          district: input.district,
          role: input.role,
          farm_name: input.farmName,
          farm_type: input.farmType,
          consent: "true",
        },
      },
    });
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw new Error(error.message);
  }, []);

  const saveProfile = useCallback(
    async (patch: Parameters<typeof updateProfile>[1]) => {
      if (!userId) return;
      setProfile(await updateProfile(userId, patch));
    },
    [userId],
  );

  const value = useMemo(
    () => ({ session, profile, districts, loading, can, signIn, signUp, signOut, resetPassword, saveProfile }),
    [session, profile, districts, loading, can, signIn, signUp, signOut, resetPassword, saveProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
