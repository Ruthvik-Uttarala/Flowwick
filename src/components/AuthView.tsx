"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/src/context/AuthContext";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";

type AuthMode = "login" | "signup" | "reset";

interface AuthViewProps {
  redirectTo: string;
  reason: string;
}

export function AuthView({ redirectTo }: AuthViewProps) {
  const router = useRouter();
  const { user, refreshSession } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();

  if (user) {
    router.replace(redirectTo);
    return null;
  }

  const handleSubmit = () => {
    startTransition(async () => {
      setStatus("");

      if (mode === "reset") {
        try {
          const response = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          const payload = await readApiResponse<{ message?: string }>(response);
          if (!response.ok || !payload?.ok) {
            setStatus(apiErrorMessage(payload, "Password reset failed."));
            return;
          }
          setStatus(payload.data?.message ?? "Check your email for a reset link.");
        } catch {
          setStatus("Password reset failed.");
        }
        return;
      }

      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const payload = await readApiResponse<{
          message?: string;
          needsConfirmation?: boolean;
        }>(response);

        if (!response.ok || !payload?.ok || !payload.data) {
          setStatus(apiErrorMessage(payload, "Authentication failed."));
          return;
        }

        if (mode === "signup" && payload.data.needsConfirmation) {
          setStatus(payload.data.message ?? "Account created. Check your email to confirm it.");
          setMode("login");
          return;
        }

        await refreshSession();
        router.replace(redirectTo);
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Something went wrong."
        );
      }
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="grid w-full gap-6 rounded-[2rem] border border-stone-200 bg-white/70 p-6 shadow-[0_8px_40px_rgba(41,37,36,0.08)] backdrop-blur-xl lg:grid-cols-[1.02fr_0.98fr] lg:p-8"
      >
        <section className="relative overflow-hidden rounded-[1.75rem] border border-stone-200 bg-gradient-to-br from-orange-50 via-amber-50/60 to-stone-50 p-8 text-stone-900">
          <div className="space-y-5">
            <span className="inline-flex rounded-full border border-orange-200 bg-orange-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-orange-700">
              FlowCart
            </span>
            <h1 className="text-4xl font-semibold tracking-tight">
              Upload once. Launch everywhere.
            </h1>
            <p className="text-sm leading-7 text-stone-600">
              Sign in with Supabase email auth to access protected settings and
              dashboard routes with session persistence via secure cookies.
            </p>
            <div className="rounded-2xl border border-stone-200 bg-white/60 p-4 text-sm text-stone-700">
              <p>After login, FlowCart routes you straight into the dashboard.</p>
            </div>
          </div>
        </section>

        <section className="glass-card rounded-[1.75rem] p-6">
          <div className="flex gap-1 rounded-2xl border border-stone-200 bg-white/60 p-1 text-sm">
            {(["login", "signup", "reset"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setMode(tab);
                  setStatus("");
                }}
                className={`flex-1 rounded-xl px-3 py-3 font-semibold transition ${
                  mode === tab
                    ? "bg-stone-800 text-white"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {tab === "login" ? "Log in" : tab === "signup" ? "Sign up" : "Reset"}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="text-stone-600">Email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                className="w-full rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-orange-400/60 focus:ring-1 focus:ring-orange-400/20"
                placeholder="you@example.com"
              />
            </label>

            {mode !== "reset" && (
              <label className="block space-y-2 text-sm">
                <span className="text-stone-600">Password</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="w-full rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-orange-400/60 focus:ring-1 focus:ring-orange-400/20"
                  placeholder={mode === "login" ? "Your password" : "At least 8 characters"}
                />
              </label>
            )}

            <button
              type="button"
              disabled={isPending}
              onClick={handleSubmit}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-orange-400 to-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending
                ? "Working..."
                : mode === "login"
                  ? "Log in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
            </button>

            {status && (
              <div className="rounded-2xl border border-stone-200 bg-white/60 px-4 py-3 text-sm text-stone-600">
                {status}
              </div>
            )}
          </div>
        </section>
      </motion.div>
    </div>
  );
}
