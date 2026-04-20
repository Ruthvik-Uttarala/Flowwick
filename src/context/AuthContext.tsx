"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";

interface AuthUser {
  id: string;
  email?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signOut: async () => {},
  refreshSession: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const PROTECTED_ROUTES = ["/dashboard", "/settings"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.ok && payload.data?.authenticated && payload.data?.user) {
        setUser({
          id: payload.data.user.id,
          email: payload.data.user.email ?? null,
        });
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (loading) return;
    const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
    if (isProtected && !user) {
      router.replace(`/auth?redirectTo=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, pathname, router]);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setUser(null);
    router.replace("/auth");
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, signOut, refreshSession }),
    [user, loading, signOut, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
