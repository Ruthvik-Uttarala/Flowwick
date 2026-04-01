"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import type { ConnectionSettings, RuntimeConfigSnapshot, SafeSettingsStatus } from "@/src/lib/types";

const EMPTY_SETTINGS: ConnectionSettings = {
  shopifyStoreDomain: "",
  shopifyAdminToken: "",
  shopifyAccessToken: "",
  shopifyClientId: "",
  shopifyClientSecret: "",
  instagramAccessToken: "",
  instagramBusinessAccountId: "",
};

interface SettingsPayload {
  settings: ConnectionSettings;
  status: SafeSettingsStatus;
  runtime: RuntimeConfigSnapshot;
}

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [connections, setConnections] = useState<ConnectionSettings>(EMPTY_SETTINGS);
  const [savedSnapshot, setSavedSnapshot] = useState<ConnectionSettings>(EMPTY_SETTINGS);
  const [status, setStatus] = useState<SafeSettingsStatus | null>(null);
  const [runtime, setRuntime] = useState<RuntimeConfigSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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

      setConnections(payload.data.settings);
      setSavedSnapshot(payload.data.settings);
      setStatus(payload.data.status);
      setRuntime(payload.data.runtime);
      setMessage("Settings loaded.");
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

  if (authLoading) {
    return (
      <div className="flex w-full items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-white/40" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isDirty = JSON.stringify(connections) !== JSON.stringify(savedSnapshot);

  const save = async () => {
    setIsSaving(true);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch("/api/settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connections),
      });
      const payload = await readApiResponse<SettingsPayload & { message?: string }>(response);
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(apiErrorMessage(payload, "Failed to save settings."));
      }

      setConnections(payload.data.settings);
      setSavedSnapshot(payload.data.settings);
      setStatus(payload.data.status);
      setRuntime(payload.data.runtime);
      setMessage(payload.data.message ?? "Settings saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const launchReady = Boolean(status?.readyForLaunch && runtime?.airiaLiveConfigured);
  const airiaLive = runtime?.airiaMode === "live";

  const inputClass =
    "glass-input w-full rounded-2xl px-4 py-3 text-sm";

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="mx-auto w-full max-w-3xl"
    >
      <section className="glass-card rounded-3xl p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">Integration Settings</h1>
            <p className="mt-2 text-sm text-white/40">
              Save your Shopify and Instagram credentials to enable product launches.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${airiaLive ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-400 glow-green" : "border border-amber-400/20 bg-amber-400/10 text-amber-400 glow-gold"}`}>
              <Zap size={12} /> Airia: {airiaLive ? "Live" : "Missing"}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${launchReady ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-400 glow-green" : "border border-rose-400/20 bg-rose-400/10 text-rose-400 glow-red"}`}>
              {launchReady ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              Launch: {launchReady ? "Ready" : "Not Ready"}
            </span>
          </div>
        </div>

        {/* Shopify Section */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} className="text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Shopify</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-white/50">Store Domain</span>
              <input
                value={connections.shopifyStoreDomain}
                onChange={(event) =>
                  setConnections((current) => ({
                    ...current,
                    shopifyStoreDomain: event.target.value,
                  }))
                }
                placeholder="your-store.myshopify.com"
                className={inputClass}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-white/50">Client ID</span>
              <input
                value={connections.shopifyClientId ?? ""}
                onChange={(event) =>
                  setConnections((current) => ({
                    ...current,
                    shopifyClientId: event.target.value,
                  }))
                }
                placeholder="Required for client credentials flow"
                className={inputClass}
              />
            </label>
            <label className="space-y-2 text-sm sm:col-span-2">
              <span className="text-white/50">Client Secret</span>
              <input
                type="password"
                value={connections.shopifyClientSecret ?? ""}
                onChange={(event) =>
                  setConnections((current) => ({
                    ...current,
                    shopifyClientSecret: event.target.value,
                  }))
                }
                placeholder="Required for client credentials flow"
                className={inputClass}
              />
            </label>
          </div>
        </div>

        {/* Instagram Section */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-pink-400" />
            <h2 className="text-lg font-semibold text-white">Instagram</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-white/50">Access Token</span>
              <input
                type="password"
                value={connections.instagramAccessToken}
                onChange={(event) =>
                  setConnections((current) => ({
                    ...current,
                    instagramAccessToken: event.target.value,
                  }))
                }
                placeholder="IGQ..."
                className={inputClass}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-white/50">Business Account ID</span>
              <input
                value={connections.instagramBusinessAccountId}
                onChange={(event) =>
                  setConnections((current) => ({
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
            className="btn-gradient inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
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
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/70 backdrop-blur-sm transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {isDirty ? (
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-400">
              Unsaved changes
            </span>
          ) : null}
        </div>

        {message ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-400"
          >
            {message}
          </motion.div>
        ) : null}
        {errorMessage ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-400"
          >
            {errorMessage}
          </motion.div>
        ) : null}
      </section>
    </motion.div>
  );
}
