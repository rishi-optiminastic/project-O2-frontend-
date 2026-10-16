"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, setToken, type CurrentUser, type Role } from "@/lib/api";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  acceptInvite: (token: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<CurrentUser>("/auth/me");
      setUser(me);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await api.login(email, password);
      setToken(access_token);
      const me = await api.get<CurrentUser>("/auth/me");
      setUser(me);
      router.push("/portal");
    },
    [router],
  );

  // Shared by signup + accept-invite: store the token, hydrate the user, enter the app.
  const enterWithToken = useCallback(
    async (access_token: string) => {
      setToken(access_token);
      const me = await api.get<CurrentUser>("/auth/me");
      setUser(me);
      router.push("/portal");
    },
    [router],
  );

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const { access_token } = await api.post<{ access_token: string }>("/auth/signup", {
        name,
        email,
        password,
      });
      await enterWithToken(access_token);
    },
    [enterWithToken],
  );

  const acceptInvite = useCallback(
    async (token: string, password: string, name?: string) => {
      const { access_token } = await api.post<{ access_token: string }>(
        `/auth/invite/${token}/accept`,
        { password, name },
      );
      await enterWithToken(access_token);
    },
    [enterWithToken],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    router.push("/portal/login");
  }, [router]);

  const hasRole = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, acceptInvite, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN_CEO: "Admin / CEO",
  CFO: "CFO",
  FINANCE_MANAGER: "Finance Manager",
  FINANCE_EXECUTIVE: "Finance Executive",
  COORDINATOR: "Coordinator",
};
