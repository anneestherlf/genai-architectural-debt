import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "manager" | "employee";

export interface UserContext {
  companyId: string | null;
  companyName: string | null;
  fullName: string;
  roles: AppRole[];
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  ctx: UserContext | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ctx, setCtx] = useState<UserContext | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCtx = async (uid: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, company_id, companies(name)")
      .eq("id", uid)
      .maybeSingle();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid);
    setCtx({
      companyId: profile?.company_id ?? null,
      companyName: (profile?.companies as { name: string } | null)?.name ?? null,
      fullName: profile?.full_name ?? "",
      roles: (roles ?? []).map((r) => r.role as AppRole),
    });
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadCtx(s.user.id), 0);
      } else {
        setCtx(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadCtx(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = async () => {
    if (user) await loadCtx(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setCtx(null);
  };

  return (
    <Ctx.Provider value={{ user, session, loading, ctx, refresh, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
