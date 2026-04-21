"use client";

import { Suspense, useEffect, useRef, useState } from "react";
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
  ShieldCheck,
  PlugZap,
  Unplug,
} from "lucide-react";
import type {
  ConnectionSettings,
  InstagramConnectionSummary,
  RuntimeConfigSnapshot,
  SafeSettingsStatus,
} from "@/src/lib/types";
import {
  SHOPIFY_OAUTH_ERROR_MESSAGES,
  getStandaloneShopifyConnectDomain,
  shouldAutostartStandaloneShopifyConnect,
  safeNormalizeShopifyDomain,
} from "@/src/lib/shopify";
import { mapInstagramOauthError } from "@/src/lib/instagram";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import { RippleCircles } from "@/src/components/ui/ripple-circles";
import { WebGLShader } from "@/src/components/ui/web-gl-shader";

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
  instagramConnection: InstagramConnectionSummary;
  instagramDebugFieldModeEnabled: boolean;
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex w-full items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-cyan-600" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}

function getInstagramBadgeClass(status: InstagramConnectionSummary | null): string {
  switch (status?.status) {
    case "connected":
    case "legacy_fallback":
      return "border border-emerald-300 bg-emerald-50 text-emerald-700";
    case "needs_reconnect":
    case "invalid_expired_token":
    case "missing_page_linkage":
    case "missing_instagram_business_account":
      return "border border-rose-300 bg-rose-50 text-rose-700";
    case "selection_required":
      return "border border-amber-300 bg-amber-50 text-amber-700";
    default:
      return "border border-slate-200 bg-slate-50 text-slate-600";
  }
}

function SettingsContent() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormSettings>(EMPTY_FORM);
  const [savedSnapshot, setSavedSnapshot] = useState<FormSettings>(EMPTY_FORM);
  const [status, setStatus] = useState<SafeSettingsStatus | null>(null);
  const [runtime, setRuntime] = useState<RuntimeConfigSnapshot | null>(null);
  const [instagramConnection, setInstagramConnection] = useState<InstagramConnectionSummary | null>(
    null
  );
  const [instagramDebugFieldModeEnabled, setInstagramDebugFieldModeEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingShopify, setIsConnectingShopify] = useState(false);
  const [isConnectingInstagram, setIsConnectingInstagram] = useState(false);
  const [isValidatingInstagram, setIsValidatingInstagram] = useState(false);
  const [isDisconnectingInstagram, setIsDisconnectingInstagram] = useState(false);
  const [selectingCandidateKey, setSelectingCandidateKey] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const autostartedConnect = useRef(false);

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
      setInstagramConnection(payload.data.instagramConnection);
      setInstagramDebugFieldModeEnabled(payload.data.instagramDebugFieldModeEnabled);
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

  useEffect(() => {
    if (searchParams.get("shopify_connected") === "true") {
      setMessage("Shopify connected successfully!");
      loadSettings();
    }

    if (searchParams.get("instagram_connected") === "true") {
      setMessage("Instagram connected successfully!");
      loadSettings();
    }

    const shopifyError = searchParams.get("shopify_error");
    if (shopifyError) {
      setErrorMessage(
        SHOPIFY_OAUTH_ERROR_MESSAGES[
          shopifyError as keyof typeof SHOPIFY_OAUTH_ERROR_MESSAGES
        ] ?? "Shopify connection failed."
      );
    }

    const instagramError = searchParams.get("instagram_error");
    if (instagramError) {
      setErrorMessage(mapInstagramOauthError(instagramError));
      loadSettings();
    }
  }, [searchParams]);

  useEffect(() => {
    if (authLoading || !user || autostartedConnect.current) return;
    if (!shouldAutostartStandaloneShopifyConnect(new URLSearchParams(searchParams.toString()))) {
      return;
    }

    const queryShopDomain = getStandaloneShopifyConnectDomain(
      new URLSearchParams(searchParams.toString())
    );
    const connectShopDomain =
      queryShopDomain || safeNormalizeShopifyDomain(form.shopifyStoreDomain);
    if (!connectShopDomain) return;

    autostartedConnect.current = true;
    setIsConnectingShopify(true);
    window.location.href = `/api/shopify/connect?shopDomain=${encodeURIComponent(
      connectShopDomain
    )}`;
  }, [authLoading, user, searchParams, form.shopifyStoreDomain]);

  if (authLoading) {
    return (
      <div className="flex w-full items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-cyan-600" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const savePayload = instagramDebugFieldModeEnabled
    ? {
        shopifyStoreDomain: form.shopifyStoreDomain,
        instagramAccessToken: form.instagramAccessToken,
        instagramBusinessAccountId: form.instagramBusinessAccountId,
      }
    : {
        shopifyStoreDomain: form.shopifyStoreDomain,
      };

  const isDirty = JSON.stringify(form) !== JSON.stringify(savedSnapshot);

  const save = async () => {
    setIsSaving(true);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch("/api/settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(savePayload),
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
      setInstagramConnection(payload.data.instagramConnection);
      setInstagramDebugFieldModeEnabled(payload.data.instagramDebugFieldModeEnabled);
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
    window.location.href = `/api/shopify/connect?shopDomain=${encodeURIComponent(
      form.shopifyStoreDomain.trim()
    )}`;
  };

  const connectInstagram = () => {
    setIsConnectingInstagram(true);
    setErrorMessage("");
    setMessage("");
    window.location.href = "/api/instagram/connect";
  };

  const validateInstagram = async () => {
    setIsValidatingInstagram(true);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch("/api/instagram/validate", { method: "POST" });
      const payload = await readApiResponse<{
        instagramConnection: InstagramConnectionSummary;
        message?: string;
      }>(response);
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(apiErrorMessage(payload, "Failed to validate Instagram."));
      }
      setInstagramConnection(payload.data.instagramConnection);
      setMessage(payload.data.message ?? "Instagram validation completed.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to validate Instagram.");
    } finally {
      setIsValidatingInstagram(false);
    }
  };

  const disconnectInstagram = async () => {
    setIsDisconnectingInstagram(true);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch("/api/instagram/disconnect", { method: "POST" });
      const payload = await readApiResponse<{
        instagramConnection: InstagramConnectionSummary;
        message?: string;
      }>(response);
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(apiErrorMessage(payload, "Failed to disconnect Instagram."));
      }
      setInstagramConnection(payload.data.instagramConnection);
      setForm((current) => ({
        ...current,
        instagramAccessToken: "",
        instagramBusinessAccountId: "",
      }));
      setSavedSnapshot((current) => ({
        ...current,
        instagramAccessToken: "",
        instagramBusinessAccountId: "",
      }));
      setMessage(payload.data.message ?? "Instagram disconnected.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to disconnect Instagram.");
    } finally {
      setIsDisconnectingInstagram(false);
    }
  };

  const selectInstagramCandidate = async (pageId: string, instagramBusinessAccountId: string) => {
    const key = `${pageId}:${instagramBusinessAccountId}`;
    setSelectingCandidateKey(key);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch("/api/instagram/connect/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, instagramBusinessAccountId }),
      });
      const payload = await readApiResponse<{
        instagramConnection: InstagramConnectionSummary;
        message?: string;
      }>(response);
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(apiErrorMessage(payload, "Failed to select the Instagram account."));
      }
      setInstagramConnection(payload.data.instagramConnection);
      setMessage(payload.data.message ?? "Instagram connected successfully.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to select the Instagram account."
      );
    } finally {
      setSelectingCandidateKey("");
    }
  };

  const launchReady = Boolean(status?.readyForLaunch);
  const openaiLive = Boolean(runtime?.openaiConfigured);
  const shopifyConnected = Boolean(status?.shopifyConnected);
  const shopifyReauthorizationRequired = Boolean(status?.shopifyReauthorizationRequired);
  const shopifyDomainSaved = Boolean(status?.shopifyStoreDomainPresent);
  const instagramConfigured = Boolean(instagramConnection?.canPublish);
  const domainChangedSinceSave =
    safeNormalizeShopifyDomain(form.shopifyStoreDomain) !==
    safeNormalizeShopifyDomain(savedSnapshot.shopifyStoreDomain);

  const inputClass = "cinematic-input w-full rounded-2xl px-4 py-3 text-sm";
  const connectInstagramLabel =
    instagramConnection?.status === "connected" || instagramConnection?.status === "legacy_fallback"
      ? "Reconnect Instagram"
      : "Connect Instagram";

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mx-auto w-full max-w-4xl"
    >
      <section className="cinematic-card relative overflow-hidden rounded-3xl p-6 space-y-6">
        <WebGLShader className="opacity-45" />
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-300/18 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-24 h-60 w-60 rounded-full bg-amber-300/18 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Integration Settings
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Keep Shopify and Instagram connected so every FlowCart launch moves through one
              reliable pipeline.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                openaiLive
                  ? "border border-violet-300 bg-violet-50 text-violet-700"
                  : "border border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              <Zap size={12} /> AI: {openaiLive ? "Live" : "Missing"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                launchReady
                  ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border border-rose-300 bg-rose-50 text-rose-700"
              }`}
            >
              {launchReady ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              Launch: {launchReady ? "Ready" : "Not Ready"}
            </span>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.03 }}
          className="relative z-10 rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag size={18} className="text-cyan-700" />
              <h2 className="text-lg font-semibold text-slate-900">Shopify</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {shopifyDomainSaved ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  <ShoppingBag size={12} /> Domain Saved
                </span>
              ) : null}
              {shopifyConnected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 size={12} /> Authorized
                </span>
              ) : null}
              {shopifyReauthorizationRequired ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                  <XCircle size={12} /> Reauthorization Required
                </span>
              ) : null}
            </div>
          </div>
          <label className="block space-y-2 text-sm">
            <span className="text-slate-600">Store Domain</span>
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
          <div className="flex items-center gap-3">
            <LiquidButton
              onClick={connectShopify}
              disabled={isConnectingShopify || !form.shopifyStoreDomain.trim()}
              variant="secondary"
              size="lg"
              className="rounded-2xl"
            >
              {isConnectingShopify ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Connecting Shopify...
                </>
              ) : (
                <>
                  <LinkIcon size={14} />{" "}
                  {shopifyConnected ? "Reconnect Shopify" : "Connect Shopify"}
                </>
              )}
            </LiquidButton>
            {isConnectingShopify ? <RippleCircles compact /> : null}
          </div>
          <div className="space-y-1 text-xs text-slate-600">
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
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="relative z-10 rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Camera size={18} className="text-cyan-700" />
              <h2 className="text-lg font-semibold text-slate-900">Instagram</h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${getInstagramBadgeClass(
                  instagramConnection
                )}`}
              >
                {instagramConfigured ? <CheckCircle2 size={12} /> : <ShieldCheck size={12} />}
                {instagramConnection?.statusLabel ?? "Disconnected"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <LiquidButton
                onClick={connectInstagram}
                disabled={isConnectingInstagram}
                variant="secondary"
                className="rounded-2xl"
              >
                {isConnectingInstagram ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Connecting...
                  </>
                ) : (
                  <>
                    <PlugZap size={14} /> {connectInstagramLabel}
                  </>
                )}
              </LiquidButton>
              <LiquidButton
                onClick={validateInstagram}
                disabled={isValidatingInstagram || !instagramConnection}
                variant="ghost"
                className="rounded-2xl"
              >
                {isValidatingInstagram ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Validating...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={14} /> Validate Connection
                  </>
                )}
              </LiquidButton>
              <LiquidButton
                onClick={disconnectInstagram}
                disabled={
                  isDisconnectingInstagram ||
                  !instagramConnection ||
                  instagramConnection.status === "disconnected"
                }
                variant="danger"
                className="rounded-2xl"
              >
                {isDisconnectingInstagram ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Disconnecting...
                  </>
                ) : (
                  <>
                    <Unplug size={14} /> Disconnect Instagram
                  </>
                )}
              </LiquidButton>
              {isConnectingInstagram || isValidatingInstagram ? (
                <RippleCircles compact className="shrink-0" />
              ) : null}
            </div>
          </div>

          <div className="space-y-1 text-sm text-slate-600">
            {instagramConnection?.selectedPageName ? (
              <p>
                Connected Page:{" "}
                <span className="font-semibold text-slate-900">
                  {instagramConnection.selectedPageName}
                </span>
              </p>
            ) : null}
            {instagramConnection?.selectedPageId ? (
              <p>
                Page ID:{" "}
                <span className="font-mono text-xs text-slate-500">
                  {instagramConnection.selectedPageId}
                </span>
              </p>
            ) : null}
            {instagramConnection?.selectedInstagramBusinessAccountId ? (
              <p>
                Instagram Business Account ID:{" "}
                <span className="font-mono text-xs text-slate-500">
                  {instagramConnection.selectedInstagramBusinessAccountId}
                </span>
              </p>
            ) : null}
            {instagramConnection?.lastValidatedAt ? (
              <p>Last validated: {new Date(instagramConnection.lastValidatedAt).toLocaleString()}</p>
            ) : null}
            {instagramConnection?.status === "legacy_fallback" ? (
              <p>Legacy manual Instagram credentials are still active. Reconnect to upgrade this connection.</p>
            ) : null}
            {instagramConnection?.status === "missing_page_linkage" ? (
              <p>
                FlowCart could not find an Instagram professional account linked to a Facebook
                Page you control. In Meta, connect that Instagram professional account to a
                Facebook Page you manage, then reconnect Instagram here.
              </p>
            ) : instagramConnection?.status === "needs_reconnect" ? (
              <p>
                FlowCart found your linked Page and Instagram account, but Meta did not return a
                Page publishing token. Reconnect Instagram and choose the Page you want FlowCart
                to publish from.
              </p>
            ) : instagramConnection?.errorCode ? (
              <p>{instagramConnection.statusLabel}. Error code: {instagramConnection.errorCode}</p>
            ) : (
              <p>
                {instagramConfigured
                  ? "Instagram is connected and ready for launches."
                  : "Use Connect Instagram to complete one-time onboarding through Meta."}
              </p>
            )}
          </div>

          {instagramConnection?.status === "selection_required" &&
          instagramConnection.candidates.length > 0 ? (
            <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-amber-700">
                  Choose the Instagram account to use
                </p>
                <p className="text-xs text-amber-700/80">
                  Select the Page and Instagram account FlowCart should publish to for this user.
                </p>
              </div>
              <div className="space-y-2">
                {instagramConnection.candidates.map((candidate) => {
                  const key = `${candidate.pageId}:${candidate.instagramBusinessAccountId}`;
                  const selecting = selectingCandidateKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        selectInstagramCandidate(
                          candidate.pageId,
                          candidate.instagramBusinessAccountId
                        )
                      }
                      disabled={Boolean(selectingCandidateKey)}
                      className="flex w-full items-center justify-between rounded-2xl border border-amber-200 bg-white px-4 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50"
                    >
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">
                          {candidate.pageName || "Untitled Facebook Page"}
                        </span>
                        <span className="block text-xs text-slate-500">
                          Page {candidate.pageId} · Instagram {candidate.instagramBusinessAccountId}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-amber-700">
                        {selecting ? "Selecting..." : "Use this account"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {instagramDebugFieldModeEnabled ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">Admin Debug Fields</p>
                <p className="text-xs text-slate-600">
                  Hidden from production users. These fields remain only as a temporary fallback.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="text-slate-600">Legacy Access Token</span>
                  <input
                    type="password"
                    value={form.instagramAccessToken}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        instagramAccessToken: event.target.value,
                      }))
                    }
                    placeholder="Legacy token"
                    className={inputClass}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-600">Legacy Business Account ID</span>
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
          ) : null}
        </motion.div>

        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <LiquidButton
            onClick={save}
            disabled={isSaving || isLoading}
            size="lg"
            className="rounded-2xl"
          >
            {isSaving ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save size={14} /> Save Settings
              </>
            )}
          </LiquidButton>
          <button
            type="button"
            onClick={loadSettings}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {isDirty ? (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              Unsaved changes
            </span>
          ) : null}
        </div>

        {message ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          >
            {message}
          </motion.div>
        ) : null}
        {errorMessage ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {errorMessage}
          </motion.div>
        ) : null}
      </section>
    </motion.div>
  );
}
