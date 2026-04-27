"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  RefreshCw,
  Save,
  Store,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/src/context/AuthContext";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import { InstagramMark, ShopifyMark } from "@/src/components/ui/brand-icons";
import type {
  ConnectionSettings,
  InstagramConnectionSummary,
  SafeSettingsStatus,
} from "@/src/lib/types";

type Step = 1 | 2 | 3;

interface OnboardingRecord {
  storeName: string;
  industry: string;
  instagramHandle: string;
  niche: string;
  onboardingCompleted: boolean;
  onboardingStep: Step;
}

interface OnboardingSettings {
  shopifyStoreDomain: string;
  shopifyConnected: boolean;
  shopifyDomainSaved: boolean;
  instagramConnected: boolean;
  instagramSummary: InstagramConnectionSummary;
}

interface OnboardingPayload {
  onboarding: OnboardingRecord;
  settings: OnboardingSettings;
}

interface SettingsSavePayload {
  settings: ConnectionSettings;
  status: SafeSettingsStatus;
  instagramConnection: InstagramConnectionSummary;
  message?: string;
}

const INDUSTRIES = [
  "Fashion / boutique clothing",
  "Sarees / ethnic wear",
  "Jewelry / accessories",
  "Shoes / bags",
  "Beauty / skincare",
  "Home goods",
  "Other",
];

const EMPTY_ONBOARDING: OnboardingRecord = {
  storeName: "",
  industry: "",
  instagramHandle: "",
  niche: "",
  onboardingCompleted: false,
  onboardingStep: 1,
};

function normalizeStep(value: number | undefined): Step {
  if (value === 2 || value === 3) return value;
  return 1;
}

function cleanHandle(value: string): string {
  return value.trim().replace(/^@+/, "");
}

export function OnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<OnboardingRecord>(EMPTY_ONBOARDING);
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [settings, setSettings] = useState<OnboardingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectingShopify, setConnectingShopify] = useState(false);
  const [connectingInstagram, setConnectingInstagram] = useState(false);
  const [validatingInstagram, setValidatingInstagram] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadOnboarding = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/onboarding", { cache: "no-store" });
      const payload = await readApiResponse<OnboardingPayload>(response);
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(apiErrorMessage(payload, "Failed to load setup."));
      }

      const onboarding = payload.data.onboarding;
      setDraft({
        ...onboarding,
        onboardingStep: normalizeStep(onboarding.onboardingStep),
        instagramHandle: cleanHandle(onboarding.instagramHandle),
      });
      setStep(normalizeStep(onboarding.onboardingStep));
      setSettings(payload.data.settings);
      setShopifyDomain(payload.data.settings.shopifyStoreDomain);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load setup.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void loadOnboarding();
  }, [authLoading, loadOnboarding]);

  useEffect(() => {
    if (searchParams.get("shopify_connected") === "true") {
      setMessage("Shopify connected.");
      setStep(2);
      void loadOnboarding();
    }
    if (searchParams.get("instagram_connected") === "true") {
      setMessage("Instagram connected.");
      setStep(3);
      void loadOnboarding();
    }
  }, [searchParams, loadOnboarding]);

  const visualSrc = "/brand/flowwick-onboarding-quiz-preview-visual.png";
  const shopifyConnected = Boolean(settings?.shopifyConnected);
  const shopifyDomainSaved = Boolean(settings?.shopifyDomainSaved || shopifyDomain.trim());
  const instagramConnected = Boolean(settings?.instagramConnected);
  const instagramStatusLabel = settings?.instagramSummary?.statusLabel ?? "Not connected";

  const progressLabel = `Step ${step} of 3`;
  const progressWidth = `${(step / 3) * 100}%`;

  const saveBusinessStep = async () => {
    if (!draft.industry) {
      setErrorMessage("Choose what you sell.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setMessage("");

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: draft.storeName,
          industry: draft.industry,
          instagramHandle: cleanHandle(draft.instagramHandle),
          niche: draft.niche,
          onboardingStep: 2,
        }),
      });
      const payload = await readApiResponse<OnboardingPayload>(response);
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(apiErrorMessage(payload, "Failed to save your shop."));
      }

      setDraft({
        ...payload.data.onboarding,
        onboardingStep: normalizeStep(payload.data.onboarding.onboardingStep),
      });
      setSettings(payload.data.settings);
      setShopifyDomain(payload.data.settings.shopifyStoreDomain);
      setStep(2);
      setMessage("Your shop details are saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save your shop.");
    } finally {
      setSaving(false);
    }
  };

  const saveShopifyDomain = async () => {
    setSaving(true);
    setErrorMessage("");
    setMessage("");

    try {
      const response = await fetch("/api/settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopifyStoreDomain: shopifyDomain }),
      });
      const payload = await readApiResponse<SettingsSavePayload>(response);
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(apiErrorMessage(payload, "Failed to save store domain."));
      }

      setShopifyDomain(payload.data.settings.shopifyStoreDomain);
      setSettings({
        shopifyStoreDomain: payload.data.settings.shopifyStoreDomain,
        shopifyConnected: payload.data.status.shopifyConnected,
        shopifyDomainSaved: payload.data.status.shopifyStoreDomainPresent,
        instagramConnected: payload.data.instagramConnection.canPublish,
        instagramSummary: payload.data.instagramConnection,
      });
      setMessage(payload.data.message ?? "Store domain saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save store domain.");
    } finally {
      setSaving(false);
    }
  };

  const continueFromShopify = async () => {
    setSaving(true);
    setErrorMessage("");
    setMessage("");

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingStep: 3 }),
      });
      const payload = await readApiResponse<OnboardingPayload>(response);
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(apiErrorMessage(payload, "Failed to continue setup."));
      }
      setSettings(payload.data.settings);
      setStep(3);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to continue setup.");
    } finally {
      setSaving(false);
    }
  };

  const connectShopify = () => {
    if (!shopifyDomain.trim()) {
      setErrorMessage("Enter your Shopify store domain first.");
      return;
    }

    setConnectingShopify(true);
    setErrorMessage("");
    window.location.href = `/api/shopify/connect?shopDomain=${encodeURIComponent(shopifyDomain.trim())}`;
  };

  const connectInstagram = () => {
    setConnectingInstagram(true);
    setErrorMessage("");
    window.location.href = "/api/instagram/connect";
  };

  const validateInstagram = async () => {
    setValidatingInstagram(true);
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

      setSettings((current) => {
        if (!current) return current;
        return {
          ...current,
          instagramConnected: payload.data.instagramConnection.canPublish,
          instagramSummary: payload.data.instagramConnection,
        };
      });
      setMessage(payload.data.message ?? "Instagram checked.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to check Instagram.");
    } finally {
      setValidatingInstagram(false);
    }
  };

  const finishSetup = async () => {
    setSaving(true);
    setErrorMessage("");
    setMessage("");

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true, onboardingStep: 3 }),
      });
      const payload = await readApiResponse<OnboardingPayload>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(apiErrorMessage(payload, "Failed to finish setup."));
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to finish setup.");
      setSaving(false);
    }
  };

  const finishLater = async () => {
    setSaving(true);
    setErrorMessage("");
    setMessage("");

    try {
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: false, onboardingStep: 3 }),
      });
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to continue.");
      setSaving(false);
    }
  };

  const setupSummary = useMemo(
    () => [
      {
        label: "Your shop",
        value: draft.storeName || "Add store name",
        ready: Boolean(draft.storeName || draft.industry),
      },
      {
        label: "Shopify",
        value: shopifyConnected ? "Connected" : shopifyDomainSaved ? "Domain saved" : "Not connected",
        ready: shopifyConnected,
      },
      {
        label: "Instagram",
        value: instagramConnected ? "Connected" : instagramStatusLabel,
        ready: instagramConnected,
      },
    ],
    [draft.storeName, draft.industry, instagramConnected, instagramStatusLabel, shopifyConnected, shopifyDomainSaved]
  );

  if (authLoading || loading) {
    return (
      <div className="flex w-full items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[color:var(--fc-text-muted)]" />
      </div>
    );
  }

  if (!user) {
    return <LoggedOutIntro />;
  }

  return (
    <div className="mx-auto w-full max-w-[1160px]">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6">
            <Image
              src="/brand/flowwick-logo-v1.png"
              alt="Flowwick"
              width={520}
              height={180}
              priority
              className="h-auto w-[150px]"
            />
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-[2.35rem]">
                  Set up Flowwick
                </h1>
                <p className="mt-2 max-w-[560px] text-sm text-[color:var(--fc-text-muted)] sm:text-base">
                  Tell us what you sell, then connect Shopify and Instagram.
                </p>
              </div>
              <span className="inline-flex w-fit items-center rounded-full border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-1.5 text-xs font-semibold text-[color:var(--fc-text-primary)]">
                {progressLabel}
              </span>
            </div>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[color:var(--fc-surface-muted)]">
              <div className="h-full rounded-full bg-[#111111] transition-all" style={{ width: progressWidth }} />
            </div>
          </div>

          {message ? <StatusMessage tone="success">{message}</StatusMessage> : null}
          {errorMessage ? <StatusMessage tone="error">{errorMessage}</StatusMessage> : null}

          <div className="relative overflow-hidden rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={`setup-step-${step}`}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.22 }}
              >
                {step === 1 ? (
                  <BusinessStep
                    draft={draft}
                    setDraft={setDraft}
                    onContinue={saveBusinessStep}
                    saving={saving}
                  />
                ) : null}

                {step === 2 ? (
                  <ShopifyStep
                    domain={shopifyDomain}
                    setDomain={setShopifyDomain}
                    connected={shopifyConnected}
                    domainSaved={shopifyDomainSaved}
                    saving={saving}
                    connecting={connectingShopify}
                    onSaveDomain={saveShopifyDomain}
                    onConnect={connectShopify}
                    onBack={() => setStep(1)}
                    onContinue={continueFromShopify}
                  />
                ) : null}

                {step === 3 ? (
                  <InstagramStep
                    preferredHandle={draft.instagramHandle}
                    connected={instagramConnected}
                    statusLabel={instagramStatusLabel}
                    saving={saving}
                    connecting={connectingInstagram}
                    validating={validatingInstagram}
                    onConnect={connectInstagram}
                    onValidate={validateInstagram}
                    onBack={() => setStep(2)}
                    onFinish={finishSetup}
                    onFinishLater={finishLater}
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white">
              <Image
                src={visualSrc}
                alt="Flowwick setup preview"
                fill
                priority
                className="object-contain object-center"
                sizes="420px"
              />
            </div>
            <div className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-4">
              <div className="grid gap-2">
                {setupSummary.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-3 rounded-lg bg-[color:var(--fc-surface-muted)] px-3 py-2"
                  >
                    <span className="text-xs font-semibold text-[color:var(--fc-text-muted)]">
                      {item.label}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--fc-text-primary)]">
                      {item.ready ? <CheckCircle2 size={13} className="text-[#16a34a]" /> : null}
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function LoggedOutIntro() {
  const previewSteps = [
    "1. Tell us what you sell",
    "2. Connect Shopify",
    "3. Connect Instagram",
    "4. Start posting",
  ];

  return (
    <div className="mx-auto grid w-full max-w-[1160px] gap-5 lg:grid-cols-[0.94fr_1.06fr] lg:items-center">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-6 sm:p-8"
      >
        <Image src="/brand/flowwick-logo-v1.png" alt="Flowwick" width={520} height={180} priority className="h-auto w-[158px]" />
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-[3rem]">
          Set up Flowwick
        </h1>
        <p className="mt-3 max-w-[520px] text-sm text-[color:var(--fc-text-muted)] sm:text-base">
          See how setup works before you sign in.
        </p>
        <div className="mt-5 grid gap-2">
          {previewSteps.map((item, index) => (
            <motion.div
              key={item}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, delay: 0.06 * (index + 1) }}
              className="rounded-xl border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-4 py-3 text-sm font-semibold text-[color:var(--fc-text-primary)]"
            >
              {item}
            </motion.div>
          ))}
        </div>
        <div className="mt-7 grid gap-2 sm:grid-cols-2">
          <LiquidButton asChild size="lg" className="h-11">
            <Link href="/auth?redirectTo=%2Finfo%3Fmode%3Dquiz">
              Start setup
              <ArrowRight size={16} />
            </Link>
          </LiquidButton>
          <LiquidButton asChild variant="secondary" size="lg" className="h-11">
            <Link href="/">Back home</Link>
          </LiquidButton>
        </div>
      </motion.section>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="relative min-h-[360px] overflow-hidden rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white lg:min-h-[620px]"
      >
        <Image
          src="/brand/flowwick-onboarding-quiz-preview-visual.png"
          alt="Flowwick onboarding quiz preview visual"
          fill
          priority
          className="object-contain object-center"
          sizes="(max-width: 1024px) 100vw, 54vw"
        />
      </motion.div>
    </div>
  );
}

function BusinessStep({
  draft,
  setDraft,
  onContinue,
  saving,
}: {
  draft: OnboardingRecord;
  setDraft: Dispatch<SetStateAction<OnboardingRecord>>;
  onContinue: () => void;
  saving: boolean;
}) {
  return (
    <div>
      <StepHeader
        eyebrow="Business"
        title="What do you sell?"
        body="Choose the closest match. You can adjust this later."
      />

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {INDUSTRIES.map((industry) => {
          const active = draft.industry === industry;
          return (
            <button
              key={industry}
              type="button"
              onClick={() => setDraft((current) => ({ ...current, industry }))}
              className={`min-h-14 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${
                active
                  ? "border-[#111111] bg-[#111111] text-white"
                  : "border-[color:var(--fc-border-subtle)] bg-white text-[color:var(--fc-text-primary)] hover:bg-[color:var(--fc-surface-muted)]"
              }`}
            >
              {industry}
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <TextField
          label="Store name"
          value={draft.storeName}
          placeholder="Your shop"
          maxLength={80}
          onChange={(value) => setDraft((current) => ({ ...current, storeName: value }))}
        />
        <TextField
          label="Instagram handle"
          value={draft.instagramHandle}
          placeholder="yourshop"
          maxLength={80}
          prefix="@"
          onChange={(value) => setDraft((current) => ({ ...current, instagramHandle: cleanHandle(value) }))}
        />
        <TextField
          label="Product style"
          value={draft.niche}
          placeholder="Linen, bridal, handmade..."
          maxLength={140}
          onChange={(value) => setDraft((current) => ({ ...current, niche: value }))}
        />
      </div>

      <div className="mt-6 flex justify-end">
        <LiquidButton onClick={onContinue} disabled={saving} size="lg" className="w-full sm:w-auto">
          {saving ? <Loader2 size={15} className="animate-spin" /> : null}
          Continue
          <ArrowRight size={15} />
        </LiquidButton>
      </div>
    </div>
  );
}

function ShopifyStep({
  domain,
  setDomain,
  connected,
  domainSaved,
  saving,
  connecting,
  onSaveDomain,
  onConnect,
  onBack,
  onContinue,
}: {
  domain: string;
  setDomain: (value: string) => void;
  connected: boolean;
  domainSaved: boolean;
  saving: boolean;
  connecting: boolean;
  onSaveDomain: () => void;
  onConnect: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div>
      <StepHeader
        eyebrow="Shopify"
        title="Connect Shopify"
        body="Add your store domain, then connect your shop."
        icon={<ShopifyMark size={18} />}
      />

      <div className="mt-5 flex flex-wrap gap-2">
        <Badge tone={connected ? "success" : domainSaved ? "neutral" : "neutral"}>
          {connected ? "Shopify connected" : domainSaved ? "Domain saved" : "Not connected"}
        </Badge>
      </div>

      <div className="mt-5">
        <TextField
          label="Store domain"
          value={domain}
          placeholder="your-store.myshopify.com"
          onChange={setDomain}
        />
        <p className="mt-2 text-xs text-[color:var(--fc-text-muted)]">
          We use Shopify’s secure connection screen after you save your store domain.
        </p>
      </div>

      <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
        <LiquidButton onClick={onSaveDomain} disabled={saving || !domain.trim()} variant="secondary" size="lg">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Save store domain
        </LiquidButton>
        <LiquidButton onClick={onConnect} disabled={connecting || !domain.trim()} size="lg">
          {connecting ? <Loader2 size={15} className="animate-spin" /> : <Store size={15} />}
          Connect Shopify
        </LiquidButton>
      </div>

      <StepFooter onBack={onBack} onContinue={onContinue} saving={saving} continueLabel="Continue" />
    </div>
  );
}

function InstagramStep({
  preferredHandle,
  connected,
  statusLabel,
  saving,
  connecting,
  validating,
  onConnect,
  onValidate,
  onBack,
  onFinish,
  onFinishLater,
}: {
  preferredHandle: string;
  connected: boolean;
  statusLabel: string;
  saving: boolean;
  connecting: boolean;
  validating: boolean;
  onConnect: () => void;
  onValidate: () => void;
  onBack: () => void;
  onFinish: () => void;
  onFinishLater: () => void;
}) {
  return (
    <div>
      <StepHeader
        eyebrow="Instagram"
        title="Connect Instagram"
        body="Choose the Instagram account where Flowwick should publish."
        icon={<InstagramMark size={18} />}
      />

      <div className="mt-5 flex flex-wrap gap-2">
        <Badge tone={connected ? "success" : "neutral"}>
          {connected ? "Instagram connected" : statusLabel}
        </Badge>
        {preferredHandle ? <Badge tone="neutral">@{preferredHandle}</Badge> : null}
      </div>

      <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
        <LiquidButton onClick={onConnect} disabled={connecting} size="lg">
          {connecting ? <Loader2 size={15} className="animate-spin" /> : <InstagramMark size={15} />}
          {connected ? "Reconnect Instagram" : "Connect Instagram"}
        </LiquidButton>
        <LiquidButton
          onClick={onValidate}
          disabled={validating || !statusLabel}
          variant="secondary"
          size="lg"
        >
          {validating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          Validate connection
        </LiquidButton>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <LiquidButton onClick={onBack} variant="secondary" size="lg">
          <ChevronLeft size={15} />
          Back
        </LiquidButton>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
          <LiquidButton onClick={onFinishLater} disabled={saving} variant="secondary" size="lg" className="w-full sm:w-auto">
            Finish later
          </LiquidButton>
          <LiquidButton onClick={onFinish} disabled={saving} size="lg" className="w-full sm:w-auto">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            Finish setup
          </LiquidButton>
        </div>
      </div>
    </div>
  );
}

function StepHeader({
  eyebrow,
  title,
  body,
  icon,
}: {
  eyebrow: string;
  title: string;
  body: string;
  icon?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {icon ? (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)]">
            {icon}
          </span>
        ) : null}
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--fc-text-soft)]">
          {eyebrow}
        </p>
      </div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--fc-text-primary)]">
        {title}
      </h2>
      <p className="mt-1 text-sm text-[color:var(--fc-text-muted)]">{body}</p>
    </div>
  );
}

function StepFooter({
  onBack,
  onContinue,
  saving,
  continueLabel,
}: {
  onBack: () => void;
  onContinue: () => void;
  saving: boolean;
  continueLabel: string;
}) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <LiquidButton onClick={onBack} variant="secondary" size="lg">
        <ChevronLeft size={15} />
        Back
      </LiquidButton>
      <LiquidButton onClick={onContinue} disabled={saving} size="lg" className="w-full sm:w-auto">
        {saving ? <Loader2 size={15} className="animate-spin" /> : null}
        {continueLabel}
        <ArrowRight size={15} />
      </LiquidButton>
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
  maxLength,
  prefix,
  disabled,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  maxLength?: number;
  prefix?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="text-[color:var(--fc-text-muted)]">{label}</span>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[color:var(--fc-text-soft)]">
            {prefix}
          </span>
        ) : null}
        <input
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className={`cinematic-input w-full rounded-lg px-3 py-2.5 text-sm disabled:bg-[color:var(--fc-surface-muted)] disabled:text-[color:var(--fc-text-soft)] ${
            prefix ? "pl-7" : ""
          }`}
        />
      </div>
    </label>
  );
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "neutral" | "success";
}) {
  const className =
    tone === "success"
      ? "border-[rgba(22,163,74,0.32)] bg-[rgba(22,163,74,0.08)] text-[#166534]"
      : "border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-muted)]";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

function StatusMessage({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "success" | "error";
}) {
  const className =
    tone === "success"
      ? "border-[rgba(22,163,74,0.32)] bg-[rgba(22,163,74,0.08)] text-[#166534]"
      : "border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.06)] text-[#b91c1c]";

  return <div className={`rounded-xl border px-4 py-3 text-sm ${className}`}>{children}</div>;
}
