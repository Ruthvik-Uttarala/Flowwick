import { getSupabaseAdmin } from "@/src/lib/server/supabase-admin";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  shopName: string;
  bio: string;
  avatarUrl: string;
  industry: string;
  instagramHandle: string;
  niche: string;
  onboardingCompleted: boolean;
  onboardingStep: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserOnboardingProfile {
  userId: string;
  storeName: string;
  industry: string;
  instagramHandle: string;
  niche: string;
  onboardingCompleted: boolean;
  onboardingStep: number;
  createdAt: string;
  updatedAt: string;
}

interface DbProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  store_name?: string | null;
  shop_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  industry?: string | null;
  instagram_handle?: string | null;
  niche?: string | null;
  onboarding_completed?: boolean | null;
  onboarding_step?: number | null;
  created_at: string;
  updated_at: string;
}

interface ProfilePatch {
  displayName?: string;
  shopName?: string;
  bio?: string;
}

interface OnboardingPatch {
  storeName?: string;
  industry?: string;
  instagramHandle?: string;
  niche?: string;
  onboardingCompleted?: boolean;
  onboardingStep?: number;
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normalizeStoreName(row: DbProfileRow): string {
  const storeName = normalizeText(row.store_name);
  if (storeName) return storeName;
  return normalizeText(row.shop_name);
}

function rowToProfile(row: DbProfileRow): UserProfile {
  return {
    id: row.id,
    email: normalizeText(row.email),
    displayName: normalizeText(row.display_name),
    shopName: normalizeStoreName(row),
    bio: normalizeText(row.bio),
    avatarUrl: normalizeText(row.avatar_url),
    industry: normalizeText(row.industry),
    instagramHandle: normalizeText(row.instagram_handle),
    niche: normalizeText(row.niche),
    onboardingCompleted: Boolean(row.onboarding_completed),
    onboardingStep: Math.min(Math.max(Number(row.onboarding_step ?? 1), 1), 3),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToOnboardingProfile(row: DbProfileRow): UserOnboardingProfile {
  const profile = rowToProfile(row);
  return {
    userId: profile.id,
    storeName: profile.shopName,
    industry: profile.industry,
    instagramHandle: profile.instagramHandle,
    niche: profile.niche,
    onboardingCompleted: profile.onboardingCompleted,
    onboardingStep: profile.onboardingStep,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

async function resolveUserEmail(userId: string): Promise<string> {
  const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(userId);
  if (error) {
    return "";
  }
  return data.user?.email?.trim() ?? "";
}

async function createProfileRow(userId: string): Promise<DbProfileRow> {
  const email = await resolveUserEmail(userId);
  const now = new Date().toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .insert({
      id: userId,
      email,
      display_name: "",
      store_name: "",
      shop_name: "",
      bio: "",
      avatar_url: "",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create profile: ${error?.message ?? "Unknown error"}`);
  }

  return data as DbProfileRow;
}

export async function getOrCreateProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (!error && data) {
    return rowToProfile(data as DbProfileRow);
  }

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to load profile: ${error.message}`);
  }

  try {
    const created = await createProfileRow(userId);
    return rowToProfile(created);
  } catch {
    const fallback = await getSupabaseAdmin()
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (fallback.error || !fallback.data) {
      throw new Error(`Failed to load profile: ${fallback.error?.message ?? "Unknown error"}`);
    }

    return rowToProfile(fallback.data as DbProfileRow);
  }
}

export async function saveProfile(userId: string, patch: ProfilePatch): Promise<UserProfile> {
  const current = await getOrCreateProfile(userId);
  const now = new Date().toISOString();
  const nextShopName = patch.shopName ?? current.shopName;

  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .update({
      display_name: patch.displayName ?? current.displayName,
      store_name: nextShopName,
      shop_name: nextShopName,
      bio: patch.bio ?? current.bio,
      updated_at: now,
    })
    .eq("id", userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to save profile: ${error?.message ?? "Unknown error"}`);
  }

  return rowToProfile(data as DbProfileRow);
}

export async function getOnboardingProfile(userId: string): Promise<UserOnboardingProfile> {
  const profile = await getOrCreateProfile(userId);
  return {
    userId: profile.id,
    storeName: profile.shopName,
    industry: profile.industry,
    instagramHandle: profile.instagramHandle,
    niche: profile.niche,
    onboardingCompleted: profile.onboardingCompleted,
    onboardingStep: profile.onboardingStep,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export async function saveOnboardingProfile(
  userId: string,
  patch: OnboardingPatch
): Promise<UserOnboardingProfile> {
  const current = await getOrCreateProfile(userId);
  const now = new Date().toISOString();
  const nextStoreName = patch.storeName ?? current.shopName;

  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .update({
      store_name: nextStoreName,
      shop_name: nextStoreName,
      industry: patch.industry ?? current.industry,
      instagram_handle: patch.instagramHandle ?? current.instagramHandle,
      niche: patch.niche ?? current.niche,
      onboarding_completed: patch.onboardingCompleted ?? current.onboardingCompleted,
      onboarding_step: patch.onboardingStep ?? current.onboardingStep,
      updated_at: now,
    })
    .eq("id", userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to save onboarding: ${error?.message ?? "Unknown error"}`);
  }

  return rowToOnboardingProfile(data as DbProfileRow);
}

export async function saveProfileAvatarUrl(userId: string, avatarUrl: string): Promise<UserProfile> {
  const current = await getOrCreateProfile(userId);
  const now = new Date().toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .update({
      avatar_url: avatarUrl,
      email: current.email,
      updated_at: now,
    })
    .eq("id", userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to save avatar: ${error?.message ?? "Unknown error"}`);
  }

  return rowToProfile(data as DbProfileRow);
}
