"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Edit3, Loader2, UploadCloud } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
import type { ProductBucket as Bucket } from "@/src/lib/types";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";

interface ProfileRecord {
  id: string;
  email: string;
  displayName: string;
  shopName: string;
  bio: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface ProfilePayload {
  profile: ProfileRecord;
}

interface BucketsPayload {
  buckets?: Bucket[];
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();

  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [draft, setDraft] = useState({
    displayName: "",
    shopName: "",
    bio: "",
  });
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const profileFormRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  const loadProfileData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const [profileResponse, bucketsResponse] = await Promise.all([
        fetch("/api/profile", { cache: "no-store" }),
        fetch("/api/buckets", { cache: "no-store" }),
      ]);

      const profilePayload = await readApiResponse<ProfilePayload>(profileResponse);
      if (!profileResponse.ok || !profilePayload?.ok || !profilePayload.data?.profile) {
        throw new Error(apiErrorMessage(profilePayload, "Failed to load profile."));
      }

      const bucketsPayload = await readApiResponse<BucketsPayload>(bucketsResponse);
      if (!bucketsResponse.ok || !bucketsPayload?.ok) {
        throw new Error(apiErrorMessage(bucketsPayload, "Failed to load posts."));
      }

      setProfile(profilePayload.data.profile);
      setDraft({
        displayName: profilePayload.data.profile.displayName,
        shopName: profilePayload.data.profile.shopName,
        bio: profilePayload.data.profile.bio,
      });
      setBuckets(Array.isArray(bucketsPayload.data?.buckets) ? bucketsPayload.data.buckets : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    void loadProfileData();
  }, [authLoading, user, loadProfileData]);

  const onSaveProfile = async () => {
    if (!profile) {
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setMessage("");

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await readApiResponse<ProfilePayload>(response);
      if (!response.ok || !payload?.ok || !payload.data?.profile) {
        throw new Error(apiErrorMessage(payload, "Failed to save profile."));
      }

      setProfile(payload.data.profile);
      setDraft({
        displayName: payload.data.profile.displayName,
        shopName: payload.data.profile.shopName,
        bio: payload.data.profile.bio,
      });
      setMessage("Profile updated.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setErrorMessage("");
    setMessage("");

    const localPreview = URL.createObjectURL(file);
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    setAvatarPreviewUrl(localPreview);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const payload = await readApiResponse<ProfilePayload>(response);
      if (!response.ok || !payload?.ok || !payload.data?.profile) {
        throw new Error(apiErrorMessage(payload, "Failed to upload avatar."));
      }

      setProfile(payload.data.profile);
      setMessage("Profile photo updated.");
      URL.revokeObjectURL(localPreview);
      setAvatarPreviewUrl("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to upload avatar.");
    } finally {
      setUploading(false);
    }
  };

  const totalPosts = buckets.length;
  const postedCount = buckets.filter((bucket) => bucket.status === "DONE").length;
  const readyCount = buckets.filter((bucket) => bucket.status === "READY").length;
  const issuesCount = buckets.filter((bucket) => bucket.status === "FAILED").length;

  const isDirty = useMemo(() => {
    if (!profile) {
      return false;
    }

    return (
      profile.displayName !== draft.displayName ||
      profile.shopName !== draft.shopName ||
      profile.bio !== draft.bio
    );
  }, [profile, draft.displayName, draft.shopName, draft.bio]);

  const avatarSrc = avatarPreviewUrl || profile?.avatarUrl || "/brand/flowwick-symbol.png";

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

  return (
    <div className="mx-auto w-full max-w-[1080px] space-y-4">
      <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-[1.9rem]">
          Your Flowwick profile
        </h1>
        <p className="mt-2 text-sm text-[color:var(--fc-text-muted)] sm:text-base">
          Manage how your shop appears inside Flowwick.
        </p>
      </section>

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

      <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[color:var(--fc-text-muted)]">
            <Loader2 size={14} className="animate-spin" />
            Loading profile...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)]"
                >
                  <Image src={avatarSrc} alt="Profile avatar" fill className="object-cover" unoptimized />
                  <span className="absolute inset-0 hidden items-center justify-center bg-black/50 text-[11px] font-semibold text-white group-hover:flex">
                    {uploading ? "Uploading" : "Change"}
                  </span>
                </button>

                <div>
                  <p className="text-lg font-semibold text-[color:var(--fc-text-primary)]">
                    {draft.shopName || draft.displayName || profile?.email || user.email || "Your shop"}
                  </p>
                  <p className="text-sm text-[color:var(--fc-text-muted)]">
                    {profile?.email || user.email || ""}
                  </p>
                  {draft.bio ? (
                    <p className="mt-2 max-w-xl text-sm text-[color:var(--fc-text-primary)]">{draft.bio}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <LiquidButton
                  onClick={() => profileFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  variant="secondary"
                  size="md"
                >
                  <Edit3 size={14} />
                  Edit profile
                </LiquidButton>
                <LiquidButton asChild variant="primary" size="md">
                  <Link href="/dashboard">View posts</Link>
                </LiquidButton>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <ProfileStat label="Total posts" value={totalPosts} />
              <ProfileStat label="Posted" value={postedCount} />
              <ProfileStat label="Ready" value={readyCount} />
              <ProfileStat label="Issues" value={issuesCount} />
            </div>
          </div>
        )}
      </section>

      <section
        ref={profileFormRef}
        className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6"
      >
        <h2 className="text-base font-semibold text-[color:var(--fc-text-primary)]">Profile details</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="text-[color:var(--fc-text-muted)]">Display name</span>
            <input
              value={draft.displayName}
              onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
              className="cinematic-input w-full rounded-lg px-3 py-2.5 text-sm"
              placeholder="Your name"
              maxLength={80}
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="text-[color:var(--fc-text-muted)]">Shop name</span>
            <input
              value={draft.shopName}
              onChange={(event) => setDraft((current) => ({ ...current, shopName: event.target.value }))}
              className="cinematic-input w-full rounded-lg px-3 py-2.5 text-sm"
              placeholder="Your shop"
              maxLength={80}
            />
          </label>
        </div>

        <label className="mt-3 block space-y-1.5 text-sm">
          <span className="text-[color:var(--fc-text-muted)]">Bio</span>
          <textarea
            value={draft.bio}
            onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
            className="cinematic-input w-full resize-none rounded-lg px-3 py-2.5 text-sm"
            rows={4}
            placeholder="Tell buyers about your store"
            maxLength={240}
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <LiquidButton
            onClick={onSaveProfile}
            disabled={saving || !isDirty}
            variant="primary"
            size="md"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving...
              </>
            ) : (
              "Save profile"
            )}
          </LiquidButton>
          <LiquidButton
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            variant="secondary"
            size="md"
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <UploadCloud size={14} />
                Upload photo
              </>
            )}
          </LiquidButton>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarUpload}
          className="sr-only"
        />
      </section>

      <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-[color:var(--fc-text-primary)]">Posts</h2>
          <Link href="/dashboard" className="text-sm font-semibold text-[color:var(--fc-text-primary)]">
            Open dashboard
          </Link>
        </div>

        {buckets.length === 0 ? (
          <p className="rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-3 text-sm text-[color:var(--fc-text-muted)]">
            No posts yet.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1 sm:gap-2">
            {buckets.map((bucket, index) => {
              const title = bucket.titleEnhanced.trim() || bucket.titleRaw.trim() || `Post ${index + 1}`;
              const image = bucket.imageUrls[0] ?? "";
              return (
                <Link
                  key={bucket.id}
                  href={`/dashboard#bucket-${bucket.id}`}
                  className="group relative aspect-square overflow-hidden rounded-sm border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)]"
                  aria-label={title}
                >
                  {image ? (
                    <Image
                      src={image}
                      alt={title}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="(max-width: 640px) 33vw, 260px"
                    />
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-2 text-center">
      <p className="text-lg font-semibold text-[color:var(--fc-text-primary)]">{value}</p>
      <p className="text-xs text-[color:var(--fc-text-muted)]">{label}</p>
    </div>
  );
}
