"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Check,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Unplug,
} from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
import type {
  ConnectionSettings,
  InstagramConnectionSummary,
  ProductBucket as Bucket,
  RuntimeConfigSnapshot,
  SafeSettingsStatus,
} from "@/src/lib/types";
import {
  SHOPIFY_OAUTH_ERROR_MESSAGES,
  getStandaloneShopifyConnectDomain,
  safeNormalizeShopifyDomain,
  shouldAutostartStandaloneShopifyConnect,
} from "@/src/lib/shopify";
import { mapInstagramOauthError } from "@/src/lib/instagram";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import { InstagramMark, ShopifyMark } from "@/src/components/ui/brand-icons";
import { getTrashDaysRemaining } from "@/src/lib/dashboard-buckets";

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

interface BucketsPayload {
  trashedBuckets?: Bucket[];
}

interface OnboardingPayload {
  onboarding: {
    storeName: string;
    industry: string;
    instagramHandle: string;
    niche: string;
    onboardingCompleted: boolean;
    onboardingStep: number;
  };
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex w-full items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[color:var(--fc-text-muted)]" />
        </div>
      }
    >
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
  const [instagramConnection, setInstagramConnection] = useState<InstagramConnectionSummary | null>(null);
  const [instagramDebugFieldModeEnabled, setInstagramDebugFieldModeEnabled] = useState(false);
  const [trashedBuckets, setTrashedBuckets] = useState<Bucket[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingPayload["onboarding"] | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingShopify, setIsConnectingShopify] = useState(false);
  const [isConnectingInstagram, setIsConnectingInstagram] = useState(false);
  const [isValidatingInstagram, setIsValidatingInstagram] = useState(false);
  const [isDisconnectingInstagram, setIsDisconnectingInstagram] = useState(false);
  const [selectingCandidateKey, setSelectingCandidateKey] = useState("");
  const [restoringBucketId, setRestoringBucketId] = useState("");
  const [deletingBucketId, setDeletingBucketId] = useState("");

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const autostartedConnect = useRef(false);

  const loadSettings = async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const [settingsResponse, bucketsResponse, onboardingResponse] = await Promise.all([
        fetch("/api/settings", { cache: "no-store" }),
        fetch("/api/buckets", { cache: "no-store" }),
        fetch("/api/onboarding", { cache: "no-store" }),
      ]);

      const settingsPayload = await readApiResponse<SettingsPayload>(settingsResponse);
      if (!settingsResponse.ok || !settingsPayload?.ok || !settingsPayload.data) {
        throw new Error(apiErrorMessage(settingsPayload, "Failed to load settings."));
      }

      const bucketsPayload = await readApiResponse<BucketsPayload>(bucketsResponse);
      if (!bucketsResponse.ok || !bucketsPayload?.ok) {
        throw new Error(apiErrorMessage(bucketsPayload, "Failed to load removed posts."));
      }

      const onboardingPayload = await readApiResponse<OnboardingPayload>(onboardingResponse);
      if (onboardingResponse.ok && onboardingPayload?.ok && onboardingPayload.data) {
        setOnboarding(onboardingPayload.data.onboarding);
      }

      const s = settingsPayload.data.settings;
      const formData: FormSettings = {
        shopifyStoreDomain: s.shopifyStoreDomain,
        instagramAccessToken: s.instagramAccessToken,
        instagramBusinessAccountId: s.instagramBusinessAccountId,
      };

      setForm(formData);
      setSavedSnapshot(formData);
      setStatus(settingsPayload.data.status);
      setRuntime(settingsPayload.data.runtime);
      setInstagramConnection(settingsPayload.data.instagramConnection);
      setInstagramDebugFieldModeEnabled(settingsPayload.data.instagramDebugFieldModeEnabled);
      setTrashedBuckets(Array.isArray(bucketsPayload.data?.trashedBuckets) ? bucketsPayload.data.trashedBuckets : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load settings.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !user) return;
    void loadSettings();
  }, [authLoading, user]);

  useEffect(() => {
    if (searchParams.get("shopify_connected") === "true") {
      setMessage("Shopify connected successfully.");
      void loadSettings();
    }

    if (searchParams.get("instagram_connected") === "true") {
      setMessage("Instagram connected successfully.");
      void loadSettings();
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
      void loadSettings();
    }

  }, [searchParams]);

  useEffect(() => {
    if (authLoading || !user || autostartedConnect.current) return;

    const query = new URLSearchParams(searchParams.toString());
    if (!shouldAutostartStandaloneShopifyConnect(query)) {
      return;
    }

    const queryShopDomain = getStandaloneShopifyConnectDomain(query);
    const connectShopDomain = queryShopDomain || safeNormalizeShopifyDomain(form.shopifyStoreDomain);
    if (!connectShopDomain) {
      return;
    }

    autostartedConnect.current = true;
    setIsConnectingShopify(true);
    window.location.href = `/api/shopify/connect?shopDomain=${encodeURIComponent(connectShopDomain)}`;
  }, [authLoading, user, searchParams, form.shopifyStoreDomain]);

  if (authLoading) {
    return (
      <div className="flex w-full items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[color:var(--fc-text-muted)]" />
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
  const shopifyConnected = Boolean(status?.shopifyConnected);
  const shopifyDomainSaved = Boolean(status?.shopifyStoreDomainPresent);
  const shopifyNeedsReconnect = Boolean(status?.shopifyReauthorizationRequired);
  const instagramConnected = Boolean(instagramConnection?.canPublish);
  const connectInstagramLabel = instagramConnected ? "Reconnect Instagram" : "Connect Instagram";

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
      setMessage(payload.data.message ?? "Settings saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const connectShopify = () => {
    if (!form.shopifyStoreDomain.trim()) {
      setErrorMessage("Enter your Shopify store domain first.");
      return;
    }

    setIsConnectingShopify(true);
    setErrorMessage("");
    setMessage("");
    window.location.href = `/api/shopify/connect?shopDomain=${encodeURIComponent(form.shopifyStoreDomain.trim())}`;
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
      setMessage(payload.data.message ?? "Instagram connection checked.");
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
      setErrorMessage(error instanceof Error ? error.message : "Failed to select the Instagram account.");
    } finally {
      setSelectingCandidateKey("");
    }
  };

  const restoreFromTrash = async (bucketId: string) => {
    setRestoringBucketId(bucketId);
    setErrorMessage("");
    setMessage("");

    try {
      const response = await fetch(`/api/buckets/${bucketId}/restore`, { method: "POST" });
      const payload = await readApiResponse<{ trashedBuckets?: Bucket[] }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(apiErrorMessage(payload, "Failed to restore post."));
      }

      setTrashedBuckets(Array.isArray(payload.data?.trashedBuckets) ? payload.data.trashedBuckets : []);
      setMessage("Post restored.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to restore post.");
    } finally {
      setRestoringBucketId("");
    }
  };

  const deleteForever = async (bucketId: string) => {
    setDeletingBucketId(bucketId);
    setErrorMessage("");
    setMessage("");

    try {
      const response = await fetch(`/api/buckets/${bucketId}`, { method: "DELETE" });
      const payload = await readApiResponse<{ trashedBuckets?: Bucket[] }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(apiErrorMessage(payload, "Failed to delete post."));
      }

      setTrashedBuckets(Array.isArray(payload.data?.trashedBuckets) ? payload.data.trashedBuckets : []);
      setMessage("Post deleted forever.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete post.");
    } finally {
      setDeletingBucketId("");
    }
  };

  const inputClass =
    "cinematic-input w-full rounded-lg border border-[color:var(--fc-border-strong)] px-3 py-2.5 text-sm";

  return (
    <div className="mx-auto w-full max-w-[1040px] space-y-4">
      <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-[1.95rem]">
          Connect your accounts
        </h1>
        <p className="mt-2 text-sm text-[color:var(--fc-text-muted)] sm:text-base">
          Connect Shopify and Instagram once. Flowwick handles the posting flow after that.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone={shopifyConnected ? "success" : "neutral"}>
            Shopify {shopifyConnected ? "connected" : "not connected"}
          </Badge>
          <Badge tone={instagramConnected ? "success" : "neutral"}>
            Instagram {instagramConnected ? "connected" : "not connected"}
          </Badge>
          <Badge tone={runtime?.openaiConfigured ? "success" : "neutral"}>
            AI {runtime?.openaiConfigured ? "on" : "off"}
          </Badge>
        </div>
      </section>

      {onboarding ? (
        <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--fc-text-primary)]">
                Business profile
              </h2>
              <p className="mt-1 text-sm text-[color:var(--fc-text-muted)]">
                These details come from your Flowwick setup.
              </p>
            </div>
            <Link
              href="/info"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[color:var(--fc-border-strong)] bg-white px-4 text-sm font-semibold text-[color:var(--fc-text-primary)] transition hover:bg-[color:var(--fc-surface-muted)]"
            >
              Edit setup
            </Link>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <SettingsDetail label="Store" value={onboarding.storeName || "Not added"} />
            <SettingsDetail label="Industry" value={onboarding.industry || "Not added"} />
            <SettingsDetail
              label="Instagram"
              value={onboarding.instagramHandle ? `@${onboarding.instagramHandle}` : "Not added"}
            />
            <SettingsDetail
              label="Setup"
              value={onboarding.onboardingCompleted ? "Complete" : `Step ${onboarding.onboardingStep} of 3`}
            />
          </div>
        </section>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-[rgba(22,163,74,0.32)] bg-[rgba(22,163,74,0.08)] px-4 py-3 text-sm text-[#166534]">
          {message}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-xl border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.06)] px-4 py-3 text-sm text-[#b91c1c]">
          {errorMessage}
        </div>
      ) : null}

      <section id="shopify" className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-primary)]">
                <ShopifyMark size={16} />
              </span>
              <h2 className="text-lg font-semibold text-[color:var(--fc-text-primary)]">Connect Shopify</h2>
            </div>
            <p className="mt-2 text-sm text-[color:var(--fc-text-muted)]">
              Connect your Shopify store so Flowwick can create and update products.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {shopifyConnected ? <Badge tone="success">Connected</Badge> : null}
            {shopifyDomainSaved ? <Badge tone="neutral">Domain saved</Badge> : null}
            {shopifyNeedsReconnect ? <Badge tone="warning">Needs reconnect</Badge> : null}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="text-sm font-medium text-[color:var(--fc-text-primary)]">Shopify store domain</label>
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
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <LiquidButton
            onClick={connectShopify}
            disabled={isConnectingShopify || !form.shopifyStoreDomain.trim()}
            variant="primary"
            size="md"
          >
            {isConnectingShopify ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Connecting...
              </>
            ) : shopifyConnected ? (
              "Reconnect Shopify"
            ) : (
              "Connect Shopify"
            )}
          </LiquidButton>
        </div>
      </section>

      <section id="instagram" className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-primary)]">
                <InstagramMark size={16} />
              </span>
              <h2 className="text-lg font-semibold text-[color:var(--fc-text-primary)]">Connect Instagram</h2>
            </div>
            <p className="mt-2 text-sm text-[color:var(--fc-text-muted)]">
              Connect the Instagram account where Flowwick should publish posts.
            </p>
          </div>

          <Badge tone={instagramConnected ? "success" : "neutral"}>
            {instagramConnection?.statusLabel ?? "Disconnected"}
          </Badge>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <LiquidButton onClick={connectInstagram} disabled={isConnectingInstagram} variant="primary" size="md">
            {isConnectingInstagram ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Connecting...
              </>
            ) : (
              connectInstagramLabel
            )}
          </LiquidButton>

          <LiquidButton
            onClick={validateInstagram}
            disabled={isValidatingInstagram || !instagramConnection}
            variant="secondary"
            size="md"
          >
            {isValidatingInstagram ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Checking...
              </>
            ) : (
              "Check connection"
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
            size="md"
          >
            {isDisconnectingInstagram ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Disconnecting...
              </>
            ) : (
              <>
                <Unplug size={14} />
                Disconnect Instagram
              </>
            )}
          </LiquidButton>
        </div>

        <div className="mt-4 space-y-1 text-sm text-[color:var(--fc-text-muted)]">
          {instagramConnection?.selectedPageName ? <p>Connected Page: {instagramConnection.selectedPageName}</p> : null}
          {instagramConnection?.selectedInstagramBusinessAccountId ? (
            <p>
              Account ID: <span className="font-mono text-xs">{instagramConnection.selectedInstagramBusinessAccountId}</span>
            </p>
          ) : null}
          {instagramConnection?.lastValidatedAt ? (
            <p>Last checked: {new Date(instagramConnection.lastValidatedAt).toLocaleString()}</p>
          ) : null}
        </div>

        {instagramConnection?.status === "selection_required" && instagramConnection.candidates.length > 0 ? (
          <div className="mt-4 space-y-2 rounded-xl border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] p-3">
            <p className="text-sm font-medium text-[color:var(--fc-text-primary)]">Choose account</p>
            {instagramConnection.candidates.map((candidate) => {
              const key = `${candidate.pageId}:${candidate.instagramBusinessAccountId}`;
              const selecting = selectingCandidateKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    selectInstagramCandidate(candidate.pageId, candidate.instagramBusinessAccountId)
                  }
                  disabled={Boolean(selectingCandidateKey)}
                  className="flex w-full items-center justify-between rounded-lg border border-[color:var(--fc-border-subtle)] bg-white px-3 py-2 text-left text-sm transition hover:bg-[color:var(--fc-surface-muted)]"
                >
                  <span>
                    {candidate.pageName || "Untitled Facebook Page"}
                    <span className="block text-xs text-[color:var(--fc-text-muted)]">
                      Page {candidate.pageId} · IG {candidate.instagramBusinessAccountId}
                    </span>
                  </span>
                  <span className="font-medium text-[color:var(--fc-text-primary)]">
                    {selecting ? "Selecting..." : "Use"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {instagramDebugFieldModeEnabled ? (
          <div className="mt-4 grid gap-3 rounded-xl border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] p-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="text-[color:var(--fc-text-muted)]">Legacy access token</span>
              <input
                type="password"
                value={form.instagramAccessToken}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    instagramAccessToken: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-[color:var(--fc-text-muted)]">Legacy business account ID</span>
              <input
                value={form.instagramBusinessAccountId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    instagramBusinessAccountId: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <LiquidButton onClick={save} disabled={isSaving || isLoading} variant="success" size="md">
            {isSaving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={14} />
                Save Settings
              </>
            )}
          </LiquidButton>
          <LiquidButton onClick={loadSettings} disabled={isSaving} variant="secondary" size="md">
            <RefreshCw size={14} />
            Refresh
          </LiquidButton>
          {isDirty ? (
            <span className="rounded-full border border-[color:var(--fc-border-strong)] bg-[color:var(--fc-surface-muted)] px-2.5 py-1 text-xs font-semibold text-[color:var(--fc-text-muted)]">
              Unsaved changes
            </span>
          ) : null}
        </div>
      </section>

      <section id="trash" className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--fc-text-primary)]">Trash</h2>
            <p className="mt-1 text-sm text-[color:var(--fc-text-muted)]">Removed posts stay here for 30 days.</p>
          </div>
          <span className="rounded-full border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-1 text-xs font-semibold text-[color:var(--fc-text-muted)]">
            {trashedBuckets.length} removed
          </span>
        </div>

        {trashedBuckets.length === 0 ? (
          <p className="mt-4 rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-3 text-sm text-[color:var(--fc-text-muted)]">
            Nothing in Trash.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {trashedBuckets.map((bucket, index) => {
              const title = bucket.titleEnhanced.trim() || bucket.titleRaw.trim() || `Post ${index + 1}`;
              const thumbnail = bucket.imageUrls[0] ?? "";
              const daysRemaining = getTrashDaysRemaining(bucket.deleteAfterAt);

              return (
                <div
                  key={bucket.id}
                  className="flex gap-3 rounded-xl border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] p-3"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-[color:var(--fc-border-subtle)] bg-white">
                    {thumbnail ? (
                      <Image
                        src={thumbnail}
                        alt={title}
                        fill
                        unoptimized
                        className="object-cover"
                        sizes="64px"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[color:var(--fc-text-primary)]">{title}</p>
                    <p className="mt-0.5 text-xs text-[color:var(--fc-text-muted)]">
                      {daysRemaining} day{daysRemaining === 1 ? "" : "s"} left
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <LiquidButton
                        onClick={() => restoreFromTrash(bucket.id)}
                        disabled={Boolean(restoringBucketId || deletingBucketId)}
                        variant="secondary"
                        size="sm"
                      >
                        {restoringBucketId === bucket.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Check size={13} />
                        )}
                        Restore
                      </LiquidButton>

                      <LiquidButton
                        onClick={() => deleteForever(bucket.id)}
                        disabled={Boolean(restoringBucketId || deletingBucketId)}
                        variant="danger"
                        size="sm"
                      >
                        {deletingBucketId === bucket.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                        Delete forever
                      </LiquidButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" }) {
  const className =
    tone === "success"
      ? "border-[rgba(22,163,74,0.32)] bg-[rgba(22,163,74,0.08)] text-[#166534]"
      : tone === "warning"
        ? "border-[rgba(202,138,4,0.35)] bg-[rgba(202,138,4,0.1)] text-[#854d0e]"
        : "border-[color:var(--fc-border-subtle)] bg-white text-[color:var(--fc-text-muted)]";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

function SettingsDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fc-text-soft)]">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold text-[color:var(--fc-text-primary)]">
        {value}
      </p>
    </div>
  );
}
