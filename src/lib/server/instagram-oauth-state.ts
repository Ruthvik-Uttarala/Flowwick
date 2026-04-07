import { getSupabaseAdmin } from "@/src/lib/server/supabase-admin";
import { INSTAGRAM_OAUTH_ERROR_MESSAGES } from "@/src/lib/instagram";

const TABLE = "instagram_oauth_states" as const;

export interface InstagramOauthStateRow {
  state: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

export class InstagramOauthStatePersistenceError extends Error {
  constructor() {
    super(INSTAGRAM_OAUTH_ERROR_MESSAGES.oauth_state_persist_failed);
    this.name = "InstagramOauthStatePersistenceError";
  }
}

export async function saveInstagramOauthState(input: {
  state: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}): Promise<void> {
  const client = getSupabaseAdmin();

  const { error: expiredCleanupError } = await client
    .from(TABLE)
    .delete()
    .lt("expires_at", input.createdAt);

  if (expiredCleanupError) {
    console.error(
      "[flowcart:instagram:oauth-state] Failed to clean up expired states:",
      expiredCleanupError.message
    );
  }

  const { error: userCleanupError } = await client.from(TABLE).delete().eq("user_id", input.userId);
  if (userCleanupError) {
    console.error(
      "[flowcart:instagram:oauth-state] Failed to remove prior user state:",
      userCleanupError.message
    );
    throw new InstagramOauthStatePersistenceError();
  }

  const { error } = await client.from(TABLE).insert({
    state: input.state,
    user_id: input.userId,
    created_at: input.createdAt,
    expires_at: input.expiresAt,
  });

  if (error) {
    console.error(
      "[flowcart:instagram:oauth-state] Failed to persist OAuth state:",
      error.message
    );
    throw new InstagramOauthStatePersistenceError();
  }
}

export async function getInstagramOauthState(
  state: string
): Promise<InstagramOauthStateRow | null> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).select("*").eq("state", state).maybeSingle();
  if (error || !data) {
    return null;
  }

  return data as InstagramOauthStateRow;
}

export async function deleteInstagramOauthState(state: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq("state", state);
  if (error) {
    throw new Error(`Failed to delete Instagram OAuth state: ${error.message}`);
  }
}
