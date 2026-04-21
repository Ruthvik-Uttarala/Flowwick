"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, Lock, Mail, Sparkles } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import { AnimatedCharactersLoginPage } from "@/src/components/ui/animated-characters-login-page";

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
        const payload = await readApiResponse<{ message?: string; needsConfirmation?: boolean }>(response);

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
        setStatus(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  };

  const tabs: { key: AuthMode; label: string }[] = [
    { key: "login", label: "Log in" },
    { key: "signup", label: "Sign up" },
    { key: "reset", label: "Reset" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="grid w-full gap-6 rounded-[2rem] border border-black/12 bg-white/88 p-5 shadow-[0_24px_48px_rgba(0,0,0,0.11)] backdrop-blur lg:grid-cols-[1.1fr_0.9fr] lg:p-8"
      >
        <section className="space-y-5">
          <div className="rounded-3xl border border-black/12 bg-white/92 p-6 shadow-[0_14px_30px_rgba(0,0,0,0.08)]">
            <span className="mono-pill">
              <Sparkles size={12} /> FlowCart Access
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-black">
              Start your launch flow.
            </h1>
            <p className="mt-3 text-sm leading-7 text-black/65">
              Sign in to continue your connected launch pipeline.
            </p>
          </div>
          <AnimatedCharactersLoginPage />
        </section>

        <section className="rounded-[1.75rem] border border-black/12 bg-white/95 p-5 shadow-[0_16px_34px_rgba(0,0,0,0.09)] sm:p-6">
          <div className="mb-6 flex gap-1 rounded-2xl border border-black/12 bg-black/[0.03] p-1 text-sm">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setMode(tab.key);
                  setStatus("");
                }}
                className={`flex-1 rounded-xl px-3 py-2.5 font-semibold transition ${
                  mode === tab.key
                    ? "bg-black text-white shadow-[0_8px_16px_rgba(0,0,0,0.18)]"
                    : "text-black/55 hover:text-black"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="text-black/65">Email</span>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40" />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  className="warm-input w-full rounded-2xl py-3 pl-11 pr-4 text-sm"
                  placeholder="you@example.com"
                />
              </div>
            </label>

            {mode !== "reset" ? (
              <label className="block space-y-2 text-sm">
                <span className="text-black/65">Password</span>
                <div className="relative">
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40" />
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    className="warm-input w-full rounded-2xl py-3 pl-11 pr-4 text-sm"
                    placeholder={mode === "login" ? "Your password" : "At least 8 characters"}
                  />
                </div>
              </label>
            ) : null}

            <LiquidButton
              type="button"
              disabled={isPending}
              onClick={handleSubmit}
              size="lg"
              className="mt-1 w-full"
              contentClassName="justify-center"
            >
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Working...
                </>
              ) : mode === "login" ? (
                <>
                  Log in <ArrowRight size={16} />
                </>
              ) : mode === "signup" ? (
                <>
                  Create account <ArrowRight size={16} />
                </>
              ) : (
                <>
                  Send reset link <ArrowRight size={16} />
                </>
              )}
            </LiquidButton>

            {status ? (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-black/15 bg-black/[0.03] px-4 py-3 text-sm text-black/78"
              >
                {status}
              </motion.div>
            ) : null}
          </div>
        </section>
      </motion.div>
    </div>
  );
}
