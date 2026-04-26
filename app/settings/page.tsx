"use client";

import Image from "next/image";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, RefreshCw, Save, Unplug, XCircle } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import { InstagramMark, ShopifyMark } from "@/src/components/ui/brand-icons";
import {
  SHOPIFY_OAUTH_ERROR_MESSAGES,
  getStandaloneShopifyConnectDomain,
  safeNormalizeShopifyDomain,
  shouldAutostartStandaloneShopifyConnect,
} from "@/src/lib/shopify";
import { mapInstagramOauthError } from "@/src/lib/instagram";
import { getTrashDaysRemaining } from "@/src/lib/dashboard-buckets";
import type {
  ConnectionSettings,
  InstagramConnectionSummary,
  RuntimeConfigSnapshot,
  SafeSettingsStatus,
  ProductBucket as Bucket,
} from "@/src/lib/types";

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

const trashDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex w-full items-center justify-center py-20">
          <Loader2
            size={24}
            className="animate-spin text-[color:var(--fc-text-muted)]"
          />
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
  const autostartedConnect = useRef(false);

  const [form, setForm] = useState<FormSettings>(EMPTY_FORM);
  const [savedSnapshot, setSavedSnapshot] = useState<FormSettings>(EMPTY_FORM);
  const [status, setStatus] = useState<SafeSettingsStatus | null>(null);
  const [runtime, setRuntime] = useState<RuntimeConfigSnapshot | null>(null);
  const [instagramConnection, setInstagramConnection] =
    useState<InstagramConnectionSummary | null>(null);
  const [instagramDebugFieldModeEnabled, setInstagramDebugFieldModeEnabled] =
    useState(false);

  const [trashedPosts, setTrashedPosts] = useState<Bucket[]>([]);
  const [isLoadingTrash, setIsLoadingTrash] = useState(true);
  const [restoringTrashId, setRestoringTrashId] = useState("");
  const [deletingTrashId, setDeletingTrashId] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingShopify, setIsConnectingShopify] = useState(false);
  const [isConnectingInstagram, setIsConnectingInstagram] = useState(false);
  const [isValidatingInstagram, setIsValidatingInstagram] = useState(false);
  const [isDisconnectingInstagram, setIsDisconnectingInstagram] = useState(false);
  const [selectingCandidateKey, setSelectingCandidateKey] = useState("");

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

      const settings = payload.data.settings;
      const formData: FormSettings = {
        shopifyStoreDomain: settings.shopifyStoreDomain,
        instagramAccessToken: settings.instagramAccessToken,
        instagramBusinessAccountId: settings.instagramBusinessAccountId,
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

  const loadTrash = async () => {
    setIsLoadingTrash(true);
    try {
      const response = await fetch("/api/buckets", { cache: "no-store" });
      const payload = await readApiResponse<{ trashedBuckets?: Bucket[] }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(apiErrorMessage(payload, "Failed to load trash."));
      }
      setTrashedPosts(
        Array.isArray(payload.data?.trashedBuckets) ? payload.data.trashedBuckets : []
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load trash.");
    } finally {
      setIsLoadingTrash(false);
    }
  };

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    void Promise.all([loadSettings(), loadTrash()]);
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
    if (authLoading || !user || autostartedConnect.current) {
      return;
    }
    if (!shouldAutostartStandaloneShopifyConnect(new URLSearchParams(searchParams.toString()))) {
      return;
    }

    const queryShopDomain = getStandaloneShopifyConnectDomain(
      new URLSearchParams(searchParams.toString())
    );
    const connectShopDomain =
      queryShopDomain || safeNormalizeShopifyDomain(form.shopifyStoreDomain);
    if (!connectShopDomain) {
      return;
    }

    autostartedConnect.current = true;
    setIsConnectingShopify(true);
    window.location.href = `/api/shopify/connect?shopDomain=${encodeURIComponent(
      connectShopDomain
    )}`;
  }, [authLoading, user, searchParams, form.shopifyStoreDomain]);

  if (authLoading) {
    return (
      <div className="flex w-full items-center justify-center py-20">
        <Loader2
          size={24}
          className="animate-spin text-[color:var(--fc-text-muted)]"
        />
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
      const payload = await readApiResponse<SettingsPayload & { message?: string }>(
        response
      );
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(apiErrorMessage(payload, "Failed to save settings."));
      }

      const settings = payload.data.settings;
      const formData: FormSettings = {
        shopifyStoreDomain: settings.shopifyStoreDomain,
        instagramAccessToken: settings.instagramAccessToken,
        instagramBusinessAccountId: settings.instagramBusinessAccountId,
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
      setErrorMessage("Enter your Shopify store domain before connecting.");
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
        throw new Error(apiErrorMessage(payload, "Failed to check Instagram."));
      }
      setInstagramConnection(payload.data.instagramConnection);
      setMessage(payload.data.message ?? "Instagram connection checked.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to check Instagram.");
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
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to disconnect Instagram."
      );
    } finally {
      setIsDisconnectingInstagram(false);
    }
  };

  const selectInstagramCandidate = async (
    pageId: string,
    instagramBusinessAccountId: string
  ) => {
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
        throw new Error(apiErrorMessage(payload, "Failed to select account."));
      }
      setInstagramConnection(payload.data.instagramConnection);
      setMessage(payload.data.message ?? "Instagram connected successfully.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to select account.");
    } finally {
      setSelectingCandidateKey("");
    }
  };

  const restoreTrashPost = async (postId: string) => {
    setRestoringTrashId(postId);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch(`/api/buckets/${postId}/restore`, { method: "POST" });
      const payload = await readApiResponse<{ trashedBuckets?: Bucket[] }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(apiErrorMessage(payload, "Failed to restore post."));
      }
      if (Array.isArray(payload.data?.trashedBuckets)) {
        setTrashedPosts(payload.data.trashedBuckets);
      } else {
        setTrashedPosts((current) => current.filter((item) => item.id !== postId));
      }
      setMessage("Post restored.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to restore post.");
    } finally {
      setRestoringTrashId("");
    }
  };

  const deleteTrashPost = async (postId: string) => {
    setDeletingTrashId(postId);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch(`/api/buckets/${postId}`, { method: "DELETE" });
      const payload = await readApiResponse<{
        deletedBucketId?: string;
        trashedBuckets?: Bucket[];
      }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(apiErrorMessage(payload, "Failed to delete post."));
      }
      const deletedId = payload.data?.deletedBucketId ?? postId;
      if (Array.isArray(payload.data?.trashedBuckets)) {
        setTrashedPosts(payload.data.trashedBuckets);
      } else {
        setTrashedPosts((current) => current.filter((item) => item.id !== deletedId));
      }
      setMessage("Post deleted.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete post.");
    } finally {
      setDeletingTrashId("");
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

  const connectInstagramLabel =
    instagramConnection?.status === "connected" ||
    instagramConnection?.status === "legacy_fallback"
      ? "Reconnect Instagram"
      : "Connect Instagram";

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4">
      <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6">
        <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--fc-text-primary)]">
          Connect your accounts
        </h1>
        <p className="mt-2 text-sm text-[color:var(--fc-text-muted)] sm:text-base">
          Connect Shopify and Instagram once. FlowCart handles the posting flow after
          that.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
              launchReady
                ? "border-[rgba(22,163,74,0.32)] bg-[rgba(22,163,74,0.08)] text-[#15803d]"
                : "border-[color:var(--fc-border-strong)] bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-muted)]"
            }`}
          >
            {launchReady ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {launchReady ? "Ready to post" : "Not ready"}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
              openaiLive
                ? "border-[rgba(22,163,74,0.32)] bg-[rgba(22,163,74,0.08)] text-[#15803d]"
                : "border-[color:var(--fc-border-strong)] bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-muted)]"
            }`}
          >
            AI {openaiLive ? "On" : "Off"}
          </span>
        </div>
      </section>

      <section
        id="shopify"
        className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-primary)]">
              <ShopifyMark size={18} />
            </div>
            <h2 className="mt-3 text-xl font-semibold text-[color:var(--fc-text-primary)]">
              Connect Shopify
            </h2>
            <p className="mt-1 text-sm text-[color:var(--fc-text-muted)]">
              Connect your Shopify store so FlowCart can create and update products.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {shopifyConnected ? (
              <Badge className="border-[rgba(22,163,74,0.32)] bg-[rgba(22,163,74,0.08)] text-[#15803d]">
                Connected
              </Badge>
            ) : null}
            {shopifyDomainSaved ? <Badge>Domain saved</Badge> : null}
            {shopifyReauthorizationRequired ? <Badge>Needs reconnect</Badge> : null}
          </div>
        </div>

        <label className="mt-4 block space-y-2 text-sm">
          <span className="text-[color:var(--fc-text-muted)]">Shopify store domain</span>
          <input
            value={form.shopifyStoreDomain}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                shopifyStoreDomain: event.target.value,
              }))
            }
            placeholder="your-store.myshopify.com"
            className="cinematic-input w-full rounded-lg px-4 py-2.5 text-sm"
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <LiquidButton
            onClick={connectShopify}
            disabled={isConnectingShopify || !form.shopifyStoreDomain.trim()}
            variant="primary"
            size="md"
          >
            {isConnectingShopify ? <Loader2 size={14} className="animate-spin" /> : null}
            Connect Shopify
          </LiquidButton>
          <LiquidButton
            onClick={connectShopify}
            disabled={isConnectingShopify || !form.shopifyStoreDomain.trim()}
            variant="secondary"
            size="md"
          >
            Reconnect Shopify
          </LiquidButton>
        </div>

        {domainChangedSinceSave ? (
          <p className="mt-2 text-xs text-[color:var(--fc-text-muted)]">
            Save settings after changing the domain.
          </p>
        ) : null}
      </section>

      <section
        id="instagram"
        className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-primary)]">
              <InstagramMark size={18} />
            </div>
            <h2 className="mt-3 text-xl font-semibold text-[color:var(--fc-text-primary)]">
              Connect Instagram
            </h2>
            <p className="mt-1 text-sm text-[color:var(--fc-text-muted)]">
              Connect the Instagram account where FlowCart should publish posts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              className={
                instagramConfigured
                  ? "border-[rgba(22,163,74,0.32)] bg-[rgba(22,163,74,0.08)] text-[#15803d]"
                  : undefined
              }
            >
              {instagramConnection?.statusLabel ?? "Disconnected"}
            </Badge>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <LiquidButton
            onClick={connectInstagram}
            disabled={isConnectingInstagram}
            variant="primary"
            size="md"
          >
            {isConnectingInstagram ? <Loader2 size={14} className="animate-spin" /> : null}
            Connect Instagram
          </LiquidButton>
          <LiquidButton
            onClick={connectInstagram}
            disabled={isConnectingInstagram}
            variant="secondary"
            size="md"
          >
            {connectInstagramLabel}
          </LiquidButton>
          <LiquidButton
            onClick={validateInstagram}
            disabled={isValidatingInstagram || !instagramConnection}
            variant="secondary"
            size="md"
          >
            {isValidatingInstagram ? <Loader2 size={14} className="animate-spin" /> : null}
            Check connection
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
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Unplug size={14} />
            )}
            Disconnect Instagram
          </LiquidButton>
        </div>

        <div className="mt-3 space-y-1 text-sm text-[color:var(--fc-text-muted)]">
          {instagramConnection?.selectedPageName ? (
            <p>
              Connected page:{" "}
              <span className="font-semibold text-[color:var(--fc-text-primary)]">
                {instagramConnection.selectedPageName}
              </span>
            </p>
          ) : null}
          {instagramConnection?.lastValidatedAt ? (
            <p>
              Last checked:{" "}
              {new Date(instagramConnection.lastValidatedAt).toLocaleString()}
            </p>
          ) : null}
          {!instagramConnection?.selectedPageName ? (
            <p>Use Connect Instagram to complete setup.</p>
          ) : null}
        </div>

        {instagramConnection?.status === "selection_required" &&
        instagramConnection.candidates.length > 0 ? (
          <div className="mt-4 space-y-2 rounded-xl border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] p-3">
            <p className="text-sm font-semibold text-[color:var(--fc-text-primary)]">
              Select account
            </p>
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
                  className="flex w-full items-center justify-between rounded-lg border border-[color:var(--fc-border-strong)] bg-white px-3 py-2 text-left text-sm hover:bg-[color:var(--fc-surface-muted)]"
                >
                  <span>
                    {candidate.pageName || "Untitled Facebook Page"} • Instagram{" "}
                    {candidate.instagramBusinessAccountId}
                  </span>
                  <span className="font-semibold text-[color:var(--fc-text-primary)]">
                    {selecting ? "Saving..." : "Use"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {instagramDebugFieldModeEnabled ? (
          <div className="mt-4 rounded-xl border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] p-4">
            <p className="text-sm font-semibold text-[color:var(--fc-text-primary)]">
              Debug fields
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
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
                  className="cinematic-input w-full rounded-lg px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[color:var(--fc-text-muted)]">
                  Legacy business account ID
                </span>
                <input
                  value={form.instagramBusinessAccountId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      instagramBusinessAccountId: event.target.value,
                    }))
                  }
                  className="cinematic-input w-full rounded-lg px-3 py-2"
                />
              </label>
            </div>
          </div>
        ) : null}
      </section>

      <section
        id="trash"
        className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[color:var(--fc-text-primary)]">
              Trash
            </h2>
            <p className="mt-1 text-sm text-[color:var(--fc-text-muted)]">
              Removed posts stay here for 30 days.
            </p>
          </div>
          <Badge>{trashedPosts.length} removed</Badge>
        </div>

        {isLoadingTrash ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-[color:var(--fc-text-muted)]">
            <Loader2 size={14} className="animate-spin" />
            Loading trash...
          </div>
        ) : trashedPosts.length === 0 ? (
          <p className="mt-4 rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-4 py-3 text-sm text-[color:var(--fc-text-muted)]">
            Nothing in trash.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {trashedPosts.map((post, index) => {
              const title =
                post.titleEnhanced.trim() || post.titleRaw.trim() || `Post ${index + 1}`;
              const imageUrl = post.imageUrls[0] ?? "";
              const daysRemaining = getTrashDaysRemaining(post.deleteAfterAt);
              const removedDate = post.trashedAt
                ? trashDateFormatter.format(new Date(post.trashedAt))
                : "Unknown";

              return (
                <div
                  key={post.id}
                  className="flex gap-3 rounded-xl border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] p-3"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-[color:var(--fc-border-strong)] bg-white">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={title}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[color:var(--fc-text-primary)]">
                      {title}
                    </p>
                    <p className="mt-0.5 text-xs text-[color:var(--fc-text-muted)]">
                      Removed {removedDate} • {daysRemaining} day
                      {daysRemaining === 1 ? "" : "s"} left
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <LiquidButton
                        onClick={() => restoreTrashPost(post.id)}
                        disabled={Boolean(restoringTrashId) || Boolean(deletingTrashId)}
                        variant="secondary"
                        size="sm"
                      >
                        {restoringTrashId === post.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : null}
                        Restore
                      </LiquidButton>
                      <LiquidButton
                        onClick={() => deleteTrashPost(post.id)}
                        disabled={Boolean(restoringTrashId) || Boolean(deletingTrashId)}
                        variant="danger"
                        size="sm"
                      >
                        {deletingTrashId === post.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : null}
                        Delete
                      </LiquidButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <LiquidButton
            onClick={save}
            disabled={isSaving || isLoading}
            variant="success"
            size="lg"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Settings
          </LiquidButton>
          <LiquidButton
            onClick={() => {
              void Promise.all([loadSettings(), loadTrash()]);
            }}
            disabled={isSaving}
            variant="secondary"
            size="lg"
          >
            <RefreshCw size={14} />
            Refresh
          </LiquidButton>
          {isDirty ? (
            <Badge>Unsaved changes</Badge>
          ) : null}
        </div>

        {message ? (
          <div className="mt-3 rounded-lg border border-[rgba(22,163,74,0.32)] bg-[rgba(22,163,74,0.08)] px-4 py-3 text-sm text-[#15803d]">
            {message}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="mt-3 rounded-lg border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.06)] px-4 py-3 text-sm text-[#b42318]">
            {errorMessage}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-[color:var(--fc-border-strong)] bg-[color:var(--fc-surface-muted)] px-3 py-1 text-xs font-semibold text-[color:var(--fc-text-muted)] ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
