import { extractUserId } from "@/src/lib/server/auth";
import { errorResponse } from "@/src/lib/server/api-response";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/src/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const body = await request.json();
    const shopDomain = (body.shopDomain ?? "").trim();

    if (!shopDomain) {
      return errorResponse("Shop domain is required.", { status: 400 });
    }

    const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
    if (!clientId) {
      return errorResponse("Shopify OAuth is not configured on the server.", { status: 500 });
    }

    // Normalize domain
    const normalized = shopDomain
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");
    const fullDomain = normalized.includes(".") ? normalized : `${normalized}.myshopify.com`;

    // Generate a random state for CSRF protection
    const state = crypto.randomBytes(16).toString("hex");

    // Store state in DB for validation in callback
    await getSupabaseAdmin()
      .from("shopify_oauth_states")
      .upsert(
        {
          user_id: userId,
          state,
          shop_domain: fullDomain,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/shopify/callback`;
    const scopes = "write_products,read_products";

    const installUrl =
      `https://${fullDomain}/admin/oauth/authorize` +
      `?client_id=${clientId}` +
      `&scope=${scopes}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`;

    return NextResponse.json({ ok: true, data: { installUrl } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initiate Shopify connection.";
    console.error("[flowcart:shopify:connect]", error);
    return errorResponse(message, { status: 500 });
  }
}
