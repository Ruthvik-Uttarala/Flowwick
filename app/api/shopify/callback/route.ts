import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/src/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ShopifyTokenResponse {
  access_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("shop");
  const state = url.searchParams.get("state");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!code || !shop || !state) {
    return NextResponse.redirect(`${appUrl}/settings?shopify_error=missing_params`);
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    console.error("[flowcart:shopify:callback] Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET");
    return NextResponse.redirect(`${appUrl}/settings?shopify_error=server_config`);
  }

  try {
    const supabase = getSupabaseAdmin();

    // Validate state to prevent CSRF
    const { data: storedState } = await supabase
      .from("shopify_oauth_states")
      .select("*")
      .eq("state", state)
      .single();

    if (!storedState) {
      return NextResponse.redirect(`${appUrl}/settings?shopify_error=invalid_state`);
    }

    const userId = storedState.user_id;

    // Clean up used state
    await supabase.from("shopify_oauth_states").delete().eq("state", state);

    // Exchange code for permanent access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData: ShopifyTokenResponse = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("[flowcart:shopify:callback] Token exchange failed:", tokenData);
      return NextResponse.redirect(`${appUrl}/settings?shopify_error=token_exchange_failed`);
    }

    // Store the permanent access token in integration_settings
    const normalizedShop = shop.replace(/^https?:\/\//i, "").replace(/\/+$/, "");

    await supabase
      .from("integration_settings")
      .upsert(
        {
          user_id: userId,
          shopify_store_domain: normalizedShop,
          shopify_admin_token: tokenData.access_token,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    console.info(
      `[flowcart:shopify:callback] OAuth token stored for user=${userId.slice(0, 8)}... shop=${normalizedShop}`
    );

    return NextResponse.redirect(`${appUrl}/settings?shopify_connected=true`);
  } catch (error) {
    console.error("[flowcart:shopify:callback] Error:", error);
    return NextResponse.redirect(`${appUrl}/settings?shopify_error=unknown`);
  }
}
