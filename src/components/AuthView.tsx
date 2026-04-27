"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { readApiResponse } from "@/src/components/api-response";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";

type AuthMode = "login" | "signup" | "reset";
type StatusTone = "error" | "success" | "neutral";

interface AuthViewProps {
  redirectTo: string;
  reason: string;
}

interface AuthResponsePayload {
  message?: string;
  needsConfirmation?: boolean;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function AuthView({ redirectTo, reason }: AuthViewProps) {
  const router = useRouter();
  const { user, refreshSession } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(reason ? decodeURIComponent(reason) : "");
  const [statusTone, setStatusTone] = useState<StatusTone>(reason ? "neutral" : "neutral");
  const [isPending, startTransition] = useTransition();

  if (user) {
    router.replace(redirectTo);
    return null;
  }

  const setError = (message: string) => {
    setStatus(message);
    setStatusTone("error");
  };

  const setSuccess = (message: string) => {
    setStatus(message);
    setStatusTone("success");
  };

  const handleSubmit = () => {
    startTransition(async () => {
      setStatus("");
      setStatusTone("neutral");

      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) {
        setError("Enter a valid email address.");
        return;
      }

      if (mode !== "reset" && password.length === 0) {
        setError("Enter your password.");
        return;
      }

      if (mode === "reset") {
        try {
          const response = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: normalizedEmail }),
          });
          const payload = await readApiResponse<AuthResponsePayload>(response);
          if (!response.ok || !payload?.ok) {
            setError("If this email has an account, reset instructions were sent.");
            return;
          }
          setSuccess("If this email has an account, reset instructions were sent.");
        } catch {
          setError("If this email has an account, reset instructions were sent.");
        }
        return;
      }

      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalizedEmail, password }),
        });
        const payload = await readApiResponse<AuthResponsePayload>(response);

        if (!response.ok || !payload?.ok) {
          if (mode === "login") {
            setError("Invalid email or password. Use Reset if this email already has an account.");
          } else {
            setError("This email may already have an account. Try logging in or reset your password.");
          }
          return;
        }

        if (mode === "signup" && payload?.data?.needsConfirmation) {
          setSuccess("Account created. Check your email to confirm, then log in.");
          setMode("login");
          return;
        }

        await refreshSession();
        router.replace(redirectTo);
        router.refresh();
      } catch {
        if (mode === "login") {
          setError("Invalid email or password. Use Reset if this email already has an account.");
        } else {
          setError("This email may already have an account. Try logging in or reset your password.");
        }
      }
    });
  };

  const tabs: { key: AuthMode; label: string }[] = [
    { key: "login", label: "Log in" },
    { key: "signup", label: "Sign up" },
    { key: "reset", label: "Reset" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1220px] flex-1 items-center justify-center py-4 sm:py-8">
      <div className="grid w-full overflow-hidden rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[680px] overflow-hidden border-r border-[color:var(--fc-border-subtle)] bg-[#f4f1eb] lg:block">
          <Image
            src="/brand/flowwick-onboarding-visual-1.png"
            alt="Flowwick marketing visual"
            fill
            priority
            className="object-cover object-center"
            sizes="(max-width: 1024px) 0vw, 52vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/26 via-black/6 to-transparent" />
          <div className="absolute bottom-8 left-8 right-8 rounded-xl border border-white/24 bg-black/34 px-4 py-3 text-white backdrop-blur-[1px]">
            <p className="text-xl font-semibold tracking-tight">Publish everywhere.</p>
            <p className="mt-1 text-sm text-white/90">One product. Two channels.</p>
          </div>
        </section>

        <section className="flex min-h-[640px] flex-col justify-center px-6 py-8 sm:px-10">
          <div className="mx-auto w-full max-w-[390px]">
            <Image
              src="/brand/flowwick-logo-v1.png"
              alt="Flowwick"
              width={520}
              height={180}
              priority
              className="h-auto w-[160px]"
            />
            <p className="mt-3 text-sm text-[color:var(--fc-text-muted)]">Post once. Sell everywhere.</p>

            <div className="mt-6 flex gap-1 rounded-xl border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] p-1 text-sm">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setMode(tab.key);
                    setStatus("");
                    setStatusTone("neutral");
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 font-semibold transition ${
                    mode === tab.key
                      ? "bg-[#111111] text-white"
                      : "text-[color:var(--fc-text-muted)] hover:text-[color:var(--fc-text-primary)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              <label className="block space-y-1.5 text-sm">
                <span className="text-[color:var(--fc-text-muted)]">Email</span>
                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--fc-text-soft)]"
                  />
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    autoComplete="email"
                    className="cinematic-input w-full rounded-lg py-2.5 pl-10 pr-3 text-sm"
                    placeholder="you@example.com"
                  />
                </div>
              </label>

              {mode !== "reset" ? (
                <label className="block space-y-1.5 text-sm">
                  <span className="text-[color:var(--fc-text-muted)]">Password</span>
                  <div className="relative">
                    <Lock
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--fc-text-soft)]"
                    />
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      className="cinematic-input w-full rounded-lg py-2.5 pl-10 pr-3 text-sm"
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
                className="mt-1 h-10 w-full"
                contentClassName="inline-flex items-center justify-center gap-2 leading-none whitespace-nowrap"
              >
                {isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Working...
                  </>
                ) : mode === "login" ? (
                  <>
                    Log in
                    <ArrowRight size={16} />
                  </>
                ) : mode === "signup" ? (
                  <>
                    Sign up
                    <ArrowRight size={16} />
                  </>
                ) : (
                  <>
                    Send reset link
                    <ArrowRight size={16} />
                  </>
                )}
              </LiquidButton>

              {status ? (
                <div
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    statusTone === "success"
                      ? "border-[rgba(22,163,74,0.28)] bg-[rgba(22,163,74,0.08)] text-[#166534]"
                      : statusTone === "error"
                        ? "border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.06)] text-[#b91c1c]"
                        : "border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-primary)]"
                  }`}
                >
                  {status}
                </div>
              ) : null}
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-[color:var(--fc-border-subtle)] lg:hidden">
              <Image
                src="/brand/flowwick-onboarding-visual-1.png"
                alt="Flowwick auth visual"
                width={1254}
                height={1254}
                className="h-auto w-full object-cover"
                sizes="100vw"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
