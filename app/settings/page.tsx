"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/src/context/AuthContext";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
import {
  ShoppingBag,
  Camera,
  Save,
  RefreshCw,
  Loader2,
  Zap,
  CheckCircle2,
  XCircle,
  Link as LinkIcon,
} from "lucide-react";
import type { ConnectionSettings, RuntimeConfigSnapshot, SafeSettingsStatus } from "@/src/lib/types";
import {
  SHOPIFY_CALLBACK_ERROR_MESSAGES,
  safeNormalizeShopifyDomain,
} from "@/src/lib/shopify";

interface FormSettings {
  shopifyStoreDomain: string;
  instagramAccessToken: string;
  instagramBusinessAccountId: string;
}

const EMPTY_FORM: FormSettings = {
  shopifyStoreDomain: "",
  instagramAccessToken: "",
  instagramBusinessAccountId: "",
};

interface SettingsPayload {
  settings: ConnectionSettings;
  status: SafeSettingsStatus;
  runtime: RuntimeConfigSnapshot;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex w-full items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-[#C47A2C]" /></div>}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormSettings>(EMPTY_FORM);
  const [savedSnapshot, setSavedSnapshot] = useState<FormSettings>(EMPTY_FORM);
  const [status, setStatus] = useState<SafeSettingsStatus | null>(null);
  const [runtime, setRuntime] = useState<RuntimeConfigSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingShopify, setIsConnectingShopify] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadSettings = async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const payload = await readApiResponse<SettingsPayload>(response);
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(apiErrorMessage(payload, "Failed to load settings."));
      }

      const s = payload.data.settings;
      const formData: FormSettings = {
        shopifyStoreDomain: s.shopifyStoreDomain,
        instagramAccessToken: s.instagramAccessToken,
        instagramBusinessAccountId: s.instagramBusinessAccountId,
      };
      setForm(formData);
      setSavedSnapshot(formData);
      setStatus(payload.data.status);
      setRuntime(payload.data.runtime);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load settings.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !user) return;
    loadSettings();
  }, [authLoading, user]);

  // Handle OAuth callback query params
  useEffect(() => {
    if (searchParams.get("shopify_connected") === "true") {
      setMessage("Shopify connected successfully!");
      loadSettings();
    }
    const shopifyError = searchParams.get("shopify_error");
    if (shopifyError) {
      setErrorMessage(
        SHOPIFY_CALLBACK_ERROR_MESSAGES[
          shopifyError as keyof typeof SHOPIFY_CALLBACK_ERROR_MESSAGES
        ] ?? "Shopify connection failed."
      );
    }
  }, [searchParams]);

  if (authLoading) {
    return (
      <div className="flex w-full items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[#C47A2C]" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isDirty = JSON.stringify(form) !== JSON.stringify(savedSnapshot);

  const save = async () => {
    setIsSaving(true);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch("/api/settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await readApiResponse<SettingsPayload & { message?: string }>(response);
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(apiErrorMessage(payload, "Failed to save settings."));
      }

      const s = payload.data.settings;
      const formData: FormSettings = {
        shopifyStoreDomain: s.shopifyStoreDomain,
        instagramAccessToken: s.instagramAccessToken,
        instagramBusinessAccountId: s.instagramBusinessAccountId,
      };
      setForm(formData);
      setSavedSnapshot(formData);
      setStatus(payload.data.status);
      setRuntime(payload.data.runtime);
      setMessage(
        payload.data.message ??
          (payload.data.status.shopifyReauthorizationRequired
            ? "Settings saved. Shopify must be authorized again before launch."
            : "Settings saved.")
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const connectShopify = async () => {
    if (!form.shopifyStoreDomain.trim()) {
      setErrorMessage("Enter your store domain first, then click Connect Shopify.");
      return;
    }
    setIsConnectingShopify(true);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch("/api/shopify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopDomain: form.shopifyStoreDomain }),
      });
      const payload = await readApiResponse<{ installUrl?: string }>(response);
      if (!response.ok || !payload?.ok || !payload.data?.installUrl) {
        throw new Error(apiErrorMessage(payload, "Failed to initiate Shopify connection."));
      }
      window.location.href = payload.data.installUrl;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to connect Shopify.");
      setIsConnectingShopify(false);
    }
  };

  const launchReady = Boolean(status?.readyForLaunch);
  const openaiLive = Boolean(runtime?.openaiConfigured);
  const shopifyConnected = Boolean(status?.shopifyConnected);
  const shopifyReauthorizationRequired = Boolean(status?.shopifyReauthorizationRequired);
  const shopifyDomainSaved = Boolean(status?.shopifyStoreDomainPresent);
  const instagramConfigured =
    Boolean(status?.instagramAccessTokenPresent) &&
    Boolean(status?.instagramBusinessAccountIdPresent);
  const domainChangedSinceSave =
    safeNormalizeShopifyDomain(form.shopifyStoreDomain) !==
    safeNormalizeShopifyDomain(savedSnapshot.shopifyStoreDomain);

  const inputClass = "warm-input w-full rounded-2xl px-4 py-3 text-sm";

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="mx-auto w-full max-w-3xl"
    >
      <section className="warm-card rounded-3xl p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#2B1B12]">Integration Settings</h1>
            <p className="mt-2 text-sm text-[#2B1B12]/50">
              Connect your Shopify store and Instagram account to enable product launches.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${openaiLive ? "border border-[#C47A2C]/30 bg-[#C47A2C]/10 text-[#C47A2C]" : "border border-[#2B1B12]/15 bg-[#2B1B12]/5 text-[#2B1B12]/50"}`}>
              <Zap size={12} /> AI: {openaiLive ? "Live" : "Missing"}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${launchReady ? "border border-green-600/30 bg-green-600/10 text-green-700" : "border border-red-400/30 bg-red-400/10 text-red-600"}`}>
              {launchReady ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              Launch: {launchReady ? "Ready" : "Not Ready"}
            </span>
          </div>
        </div>

        {/* Shopify Section */}
        <div className="rounded-2xl border border-[#2B1B12]/10 bg-white/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag size={18} className="text-[#C47A2C]" />
              <h2 className="text-lg font-semibold text-[#2B1B12]">Shopify</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {shopifyDomainSaved ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C47A2C]/30 bg-[#C47A2C]/10 px-3 py-1 text-xs font-semibold text-[#C47A2C]">
                  <ShoppingBag size={12} /> Domain Saved
                </span>
              ) : null}
              {shopifyConnected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-green-600/30 bg-green-600/10 px-3 py-1 text-xs font-semibold text-green-700">
                  <CheckCircle2 size={12} /> Authorized
                </span>
              ) : null}
              {shopifyReauthorizationRequired ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs font-semibold text-red-600">
                  <XCircle size={12} /> Reauthorization Required
                </span>
              ) : null}
            </div>
          </div>
          <label className="block space-y-2 text-sm">
            <span className="text-[#2B1B12]/60">Store Domain</span>
            <input
              value={form.shopifyStoreDomain}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  shopifyStoreDomain: event.target.value,
                }))
              }
              placeholder="your-store.myshopify.com"
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={connectShopify}
            disabled={isConnectingShopify || !form.shopifyStoreDomain.trim()}
            className="btn-warm inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              {isConnectingShopify ? (
                <><Loader2 size={14} className="animate-spin" /> Connecting...</>
              ) : (
                <><LinkIcon size={14} /> {shopifyConnected ? "Reconnect Shopify" : "Connect Shopify"}</>
              )}
            </span>
          </button>
          <div className="space-y-1 text-xs text-[#2B1B12]/45">
            {domainChangedSinceSave ? (
              <p>Save or connect with this new domain to clear the old Shopify authorization.</p>
            ) : null}
            {shopifyConnected ? (
              <p>Shopify is authorized for the saved store domain and ready for launch.</p>
            ) : shopifyDomainSaved ? (
              <p>Authorize Shopify to generate and verify the admin token for this store before launch.</p>
            ) : (
              <p>Enter your Shopify store domain, save it, then authorize Shopify.</p>
            )}
          </div>
        </div>

        {/* Instagram Section */}
        <div className="rounded-2xl border border-[#2B1B12]/10 bg-white/60 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-[#C47A2C]" />
            <h2 className="text-lg font-semibold text-[#2B1B12]">Instagram</h2>
            {instagramConfigured ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-600/30 bg-green-600/10 px-3 py-1 text-xs font-semibold text-green-700">
                <CheckCircle2 size={12} /> Configured
              </span>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-[#2B1B12]/60">Access Token</span>
              <input
                type="password"
                value={form.instagramAccessToken}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    instagramAccessToken: event.target.value,
                  }))
                }
                placeholder="IGQ..."
                className={inputClass}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-[#2B1B12]/60">Business Account ID</span>
              <input
                value={form.instagramBusinessAccountId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    instagramBusinessAccountId: event.target.value,
                  }))
                }
                placeholder="1784..."
                className={inputClass}
              />
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={isSaving || isLoading}
            className="btn-warm inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              {isSaving ? (
                <><Loader2 size={14} className="animate-spin" /> Saving...</>
              ) : (
                <><Save size={14} /> Save Settings</>
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={loadSettings}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#2B1B12]/15 bg-white/60 px-5 py-2.5 text-sm font-semibold text-[#2B1B12]/70 transition hover:bg-white/80 hover:text-[#2B1B12] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {isDirty ? (
            <span className="rounded-full border border-[#C47A2C]/30 bg-[#C47A2C]/10 px-3 py-1 text-xs font-semibold text-[#C47A2C]">
              Unsaved changes
            </span>
          ) : null}
        </div>

        {message ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-green-600/20 bg-green-600/10 px-4 py-3 text-sm text-green-700"
          >
            {message}
          </motion.div>
        ) : null}
        {errorMessage ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-600"
          >
            {errorMessage}
          </motion.div>
        ) : null}
      </section>
    </motion.div>
  );
}
