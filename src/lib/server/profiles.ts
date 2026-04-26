import { getSupabaseAdmin } from "@/src/lib/server/supabase-admin";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  shopName: string;
  bio: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface DbProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  shop_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfilePatch {
  displayName?: string;
  shopName?: string;
  bio?: string;
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function rowToProfile(row: DbProfileRow): UserProfile {
  return {
    id: row.id,
    email: normalizeText(row.email),
    displayName: normalizeText(row.display_name),
    shopName: normalizeText(row.shop_name),
    bio: normalizeText(row.bio),
    avatarUrl: normalizeText(row.avatar_url),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .update({
      display_name: patch.displayName ?? current.displayName,
      shop_name: patch.shopName ?? current.shopName,
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
