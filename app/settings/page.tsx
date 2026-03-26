"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
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
    loadSettings();
  }, []);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="mx-auto w-full max-w-3xl"
    >
      <section className="glass-card rounded-3xl p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Integration Settings</h1>
            <p className="mt-2 text-sm text-stone-600">
              Save your Shopify and Instagram credentials to enable product launches.
            </p>
          </div>
          <div className="space-y-2">
            <div className={`rounded-full px-3 py-1 text-xs font-semibold ${airiaLive ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
              Airia: {airiaLive ? "Live" : "Missing (env)"}
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-semibold ${launchReady ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
              Launch: {launchReady ? "Ready" : "Not Ready"}
            </div>
          </div>
        </div>

        <h2 className="mt-6 text-xl font-semibold text-stone-900">Shopify</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-stone-600">Store Domain</span>
            <input
              value={connections.shopifyStoreDomain}
              onChange={(event) =>
                setConnections((current) => ({
                  ...current,
                  shopifyStoreDomain: event.target.value,
                }))
              }
              placeholder="your-store.myshopify.com"
              className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-stone-900 outline-none transition focus:border-orange-400/60 focus:ring-1 focus:ring-orange-400/20"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-stone-600">Client ID</span>
            <input
              value={connections.shopifyClientId ?? ""}
              onChange={(event) =>
                setConnections((current) => ({
                  ...current,
                  shopifyClientId: event.target.value,
                }))
              }
              placeholder="Required for client credentials flow"
              className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-stone-900 outline-none transition focus:border-orange-400/60 focus:ring-1 focus:ring-orange-400/20"
            />
          </label>
          <label className="space-y-2 text-sm sm:col-span-2">
            <span className="text-stone-600">Client Secret</span>
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
              className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-stone-900 outline-none transition focus:border-orange-400/60 focus:ring-1 focus:ring-orange-400/20"
            />
          </label>
        </div>

        <h2 className="mt-8 text-xl font-semibold text-stone-900">Instagram</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-stone-600">Access Token</span>
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
              className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-stone-900 outline-none transition focus:border-orange-400/60 focus:ring-1 focus:ring-orange-400/20"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-stone-600">Business Account ID</span>
            <input
              value={connections.instagramBusinessAccountId}
              onChange={(event) =>
                setConnections((current) => ({
                  ...current,
                  instagramBusinessAccountId: event.target.value,
                }))
              }
              placeholder="1784..."
              className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-stone-900 outline-none transition focus:border-orange-400/60 focus:ring-1 focus:ring-orange-400/20"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={isSaving || isLoading}
            className="rounded-2xl bg-gradient-to-r from-orange-400 to-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
          <button
            type="button"
            onClick={loadSettings}
            disabled={isSaving}
            className="rounded-2xl border border-stone-200 bg-white/60 px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Refresh
          </button>
          {isDirty ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              Unsaved changes
            </span>
          ) : null}
        </div>

        {message ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorMessage}
          </p>
        ) : null}
      </section>
    </motion.div>
  );
}
