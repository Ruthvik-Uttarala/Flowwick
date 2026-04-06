import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { extractUserIdFromCookieHeader } from "@/src/lib/server/auth";
import {
  buildShopifySettingsUrl,
  getAuthoritativeAppUrl,
} from "@/src/lib/server/shopify";
import { getShopifyLaunchShopDomain } from "@/src/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ShopifyLaunchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toSearchParams(
  input: Record<string, string | string[] | undefined>
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, entry);
      }
      continue;
    }
    if (typeof value === "string") {
      params.set(key, value);
    }
  }
  return params;
}

export default async function ShopifyLaunchPage({
  searchParams,
}: ShopifyLaunchPageProps) {
  const params = toSearchParams(await searchParams);
  const shopDomain = getShopifyLaunchShopDomain(params);
  const settingsUrl = new URL(
    buildShopifySettingsUrl({
      shopDomain,
    })
  );

  const cookieHeader = (await headers()).get("cookie") ?? "";
  const userId = await extractUserIdFromCookieHeader(cookieHeader);

  console.info("[flowcart:shopify:launch]", {
    authenticated: Boolean(userId),
    hasHostParam: Boolean(params.get("host")?.trim()),
    hasHmacParam: Boolean(params.get("hmac")?.trim()),
    shopDomain,
  });

  if (userId) {
    redirect(settingsUrl.toString());
  }

  const authUrl = new URL("/auth", getAuthoritativeAppUrl());
  authUrl.searchParams.set("redirectTo", `${settingsUrl.pathname}${settingsUrl.search}`);
  redirect(authUrl.toString());
}
