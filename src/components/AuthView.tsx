"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/src/context/AuthContext";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
import { Zap, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";

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

  const tabs: { key: AuthMode; label: string }[] = [
    { key: "login", label: "Log in" },
    { key: "signup", label: "Sign up" },
    { key: "reset", label: "Reset" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="grid w-full gap-6 rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-6 shadow-2xl backdrop-blur-2xl lg:grid-cols-[1.05fr_0.95fr] lg:p-8"
      >
        {/* Left panel */}
        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/[0.06] bg-gradient-to-br from-emerald-500/[0.08] via-cyan-500/[0.05] to-purple-500/[0.08] p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(52,211,153,0.1),transparent_50%)]" />
          <div className="relative space-y-5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400">
              <Zap size={12} /> FlowCart
            </span>
            <h1 className="text-4xl font-bold tracking-tight text-white">
              Upload once.
              <br />
              <span className="gradient-text">Launch everywhere.</span>
            </h1>
            <p className="text-sm leading-7 text-white/40">
              Sign in to access your dashboard, configure integrations, and
              launch products to Shopify and Instagram with one click.
            </p>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4 text-sm text-white/50">
              After login, FlowCart routes you straight into the dashboard.
            </div>
          </div>
        </section>

        {/* Right panel */}
        <section className="rounded-[1.75rem] p-6">
          {/* Tab switcher */}
          <div className="flex gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-1 text-sm">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setMode(tab.key);
                  setStatus("");
                }}
                className={`flex-1 rounded-xl px-3 py-3 font-semibold transition-all duration-200 ${
                  mode === tab.key
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="text-white/50">Email</span>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  className="glass-input w-full rounded-2xl pl-11 pr-4 py-3 text-sm"
                  placeholder="you@example.com"
                />
              </div>
            </label>

            {mode !== "reset" && (
              <label className="block space-y-2 text-sm">
                <span className="text-white/50">Password</span>
                <div className="relative">
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    className="glass-input w-full rounded-2xl pl-11 pr-4 py-3 text-sm"
                    placeholder={mode === "login" ? "Your password" : "At least 8 characters"}
                  />
                </div>
              </label>
            )}

            <button
              type="button"
              disabled={isPending}
              onClick={handleSubmit}
              className="btn-gradient inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                {isPending ? (
                  <><Loader2 size={16} className="animate-spin" /> Working...</>
                ) : mode === "login" ? (
                  <>Log in <ArrowRight size={16} /></>
                ) : mode === "signup" ? (
                  <>Create account <ArrowRight size={16} /></>
                ) : (
                  <>Send reset link <ArrowRight size={16} /></>
                )}
              </span>
            </button>

            {status && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm text-white/60"
              >
                {status}
              </motion.div>
            )}
          </div>
        </section>
      </motion.div>
    </div>
  );
}
