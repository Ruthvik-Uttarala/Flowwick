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
  onboardingCompleted: boolean | null;
  onboardingLoading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  onboardingCompleted: null,
  onboardingLoading: false,
  signOut: async () => {},
  refreshSession: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const PROTECTED_ROUTES = ["/dashboard", "/settings", "/profile"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
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
        setOnboardingCompleted(null);
      } else {
        setUser(null);
        setOnboardingCompleted(null);
      }
    } catch {
      setUser(null);
      setOnboardingCompleted(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (loading || !user) {
      setOnboardingLoading(false);
      return;
    }

    let cancelled = false;
    setOnboardingLoading(true);
    (async () => {
      try {
        const response = await fetch("/api/onboarding", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        const completed =
          Boolean(response.ok && payload?.ok && payload.data?.onboarding?.onboardingCompleted);
        if (!cancelled) {
          setOnboardingCompleted(completed);
        }
      } catch {
        if (!cancelled) {
          setOnboardingCompleted(null);
        }
      } finally {
        if (!cancelled) {
          setOnboardingLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  useEffect(() => {
    const onFocus = () => {
      void refreshSession();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshSession();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshSession]);

  useEffect(() => {
    if (loading) return;
    const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
    if (isProtected && !user) {
      router.replace(`/auth?redirectTo=${encodeURIComponent(pathname)}`);
      return;
    }

    const isSetupRoute =
      pathname.startsWith("/info") ||
      pathname.startsWith("/setup") ||
      pathname.startsWith("/auth");

    if (user && onboardingCompleted === false && !isSetupRoute) {
      router.replace("/info?mode=quiz");
    }
  }, [loading, user, onboardingCompleted, pathname, router]);

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
    () => ({
      user,
      loading,
      onboardingCompleted,
      onboardingLoading,
      signOut,
      refreshSession,
    }),
    [user, loading, onboardingCompleted, onboardingLoading, signOut, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
