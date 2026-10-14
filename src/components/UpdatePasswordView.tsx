"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { readApiResponse } from "@/src/components/api-response";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import {
  acquireSubmissionLock,
  parsePasswordRecoveryLocation,
  RecoveryCredential,
  validateNewPassword,
} from "@/src/lib/auth/password-recovery";

type LinkState = "checking" | "ready" | "expired" | "invalid" | "success";

interface UpdatePasswordPayload {
  code?: string;
}

export function UpdatePasswordView() {
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [credential, setCredential] = useState<RecoveryCredential | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLock = useRef(false);

  useEffect(() => {
    const result = parsePasswordRecoveryLocation(window.location.href);
    window.history.replaceState(null, "", "/auth/update-password");

    if (result.credential) {
      setCredential(result.credential);
      setLinkState("ready");
      return;
    }

    setLinkState(result.error === "expired" ? "expired" : "invalid");
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!credential || !acquireSubmissionLock(submissionLock)) return;

    const validationError = validateNewPassword(password, confirmation);
    if (validationError) {
      setError(validationError);
      submissionLock.current = false;
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          ...(credential.kind === "access_token"
            ? { accessToken: credential.value }
            : { tokenHash: credential.value }),
        }),
      });
      const payload = await readApiResponse<UpdatePasswordPayload>(response);

      if (!response.ok || !payload?.ok) {
        if (response.status === 401 || payload?.data?.code === "invalid_recovery_link") {
          setCredential(null);
          setLinkState("expired");
        } else {
          setError(payload?.error?.message ?? "Unable to update your password. Please try again.");
        }
        return;
      }

      setCredential(null);
      setPassword("");
      setConfirmation("");
      setLinkState("success");
    } catch {
      setError("Unable to update your password. Please try again.");
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  };

  const unavailable = linkState === "expired" || linkState === "invalid";

  return (
    <div className="mx-auto flex w-full max-w-[1220px] flex-1 items-center justify-center py-4 sm:py-8">
      <div className="grid w-full overflow-hidden rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[680px] overflow-hidden border-r border-[color:var(--fc-border-subtle)] bg-[#f4f1eb] lg:block">
          <Image src="/brand/flowwick-onboarding-visual-1.png" alt="Flowwick marketing visual" fill priority className="object-cover object-center" sizes="(max-width: 1024px) 0vw, 52vw" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/26 via-black/6 to-transparent" />
          <div className="absolute bottom-8 left-8 right-8 rounded-xl border border-white/24 bg-black/34 px-4 py-3 text-white backdrop-blur-[1px]">
            <p className="text-xl font-semibold tracking-tight">Your workspace is waiting.</p>
            <p className="mt-1 text-sm text-white/90">Choose a new password, then sign in securely.</p>
          </div>
        </section>

        <section className="flex min-h-[640px] flex-col justify-center px-6 py-10 sm:px-10">
          <div className="mx-auto w-full max-w-[390px]">
            <Image src="/brand/flowwick-logo-v1.png" alt="Flowwick" width={520} height={180} priority className="h-auto w-[160px]" />

            {linkState === "checking" ? (
              <div className="mt-10 flex items-center gap-3 text-sm text-[color:var(--fc-text-muted)]" role="status">
                <Loader2 size={18} className="animate-spin" /> Verifying your reset link...
              </div>
            ) : linkState === "success" ? (
              <div className="mt-8">
                <CheckCircle2 className="text-[#166534]" size={30} />
                <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[color:var(--fc-text-primary)]">Password updated successfully</h1>
                <p className="mt-2 text-sm leading-6 text-[color:var(--fc-text-muted)]">Your temporary recovery session has ended. Sign in again with your new password.</p>
                <Link href="/auth" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]">
                  Back to login <ArrowRight size={16} />
                </Link>
              </div>
            ) : unavailable ? (
              <div className="mt-8">
                <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--fc-text-primary)]">Reset link unavailable</h1>
                <p className="mt-3 text-sm leading-6 text-[color:var(--fc-text-muted)]">
                  {linkState === "expired" ? "This password reset link has expired or has already been used." : "This password reset link is invalid or incomplete."}
                </p>
                <Link href="/auth?mode=reset" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]">
                  Request another reset email <ArrowRight size={16} />
                </Link>
              </div>
            ) : (
              <div className="mt-8">
                <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--fc-text-primary)]">Create a new password</h1>
                <p className="mt-2 text-sm text-[color:var(--fc-text-muted)]">Use at least 8 characters. You will sign in again after the update.</p>

                <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                  <PasswordField label="New Password" value={password} onChange={setPassword} visible={showPassword} onToggle={() => setShowPassword((value) => !value)} />
                  <PasswordField label="Confirm Password" value={confirmation} onChange={setConfirmation} visible={showConfirmation} onToggle={() => setShowConfirmation((value) => !value)} />

                  {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}

                  <LiquidButton type="submit" disabled={isSubmitting} size="lg" className="h-10 w-full" contentClassName="inline-flex items-center justify-center gap-2 leading-none whitespace-nowrap">
                    {isSubmitting ? <><Loader2 size={16} className="animate-spin" /> Updating...</> : <>Update password <ArrowRight size={16} /></>}
                  </LiquidButton>
                </form>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, visible, onToggle }: { label: string; value: string; onChange: (value: string) => void; visible: boolean; onToggle: () => void }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="text-[color:var(--fc-text-muted)]">{label}</span>
      <div className="relative">
        <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--fc-text-soft)]" />
        <input value={value} onChange={(event) => onChange(event.target.value)} type={visible ? "text" : "password"} autoComplete="new-password" required className="cinematic-input w-full rounded-lg py-2.5 pl-10 pr-12 text-sm" />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-[color:var(--fc-text-muted)] hover:text-[color:var(--fc-text-primary)]" aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}>
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </label>
  );
}
