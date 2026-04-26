"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";

type AuthMode = "login" | "signup" | "reset";

interface AuthViewProps {
  redirectTo: string;
  reason: string;
}

export function AuthView({ redirectTo, reason }: AuthViewProps) {
  const router = useRouter();
  const { user, refreshSession } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(reason ? decodeURIComponent(reason) : "");
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
        const payload = await readApiResponse<{ message?: string; needsConfirmation?: boolean }>(
          response
        );

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
    <div className="mx-auto flex w-full max-w-[1180px] flex-1 items-center justify-center py-6 sm:py-10">
      <div className="grid w-full overflow-hidden rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[640px] border-r border-[color:var(--fc-border-subtle)] lg:block">
          <Image
            src="/brand/flowwick-auth-visual.png"
            alt="Flowwick auth visual"
            fill
            priority
            className="object-cover"
            sizes="(max-width: 1024px) 0vw, 52vw"
          />
        </section>

        <section className="flex min-h-[640px] flex-col justify-center p-6 sm:p-10">
          <div className="mx-auto w-full max-w-[390px]">
            <Image
              src="/brand/flowwick-horizontal.png"
              alt="Flowwick"
              width={720}
              height={240}
              priority
              className="h-auto w-[154px]"
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
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--fc-text-soft)]" />
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
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--fc-text-soft)]" />
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
                contentClassName="inline-flex items-center justify-center gap-2"
              >
                {isPending ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Working...
                  </>
                ) : mode === "login" ? (
                  <>
                    Log in <ArrowRight size={15} />
                  </>
                ) : mode === "signup" ? (
                  <>
                    Sign up <ArrowRight size={15} />
                  </>
                ) : (
                  <>
                    Send reset link <ArrowRight size={15} />
                  </>
                )}
              </LiquidButton>

              {status ? (
                <div className="rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-2 text-sm text-[color:var(--fc-text-primary)]">
                  {status}
                </div>
              ) : null}
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-[color:var(--fc-border-subtle)] lg:hidden">
              <Image
                src="/brand/flowwick-auth-visual.png"
                alt="Flowwick auth visual"
                width={1200}
                height={1400}
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
