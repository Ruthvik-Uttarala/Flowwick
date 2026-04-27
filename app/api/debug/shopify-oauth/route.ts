import { NextResponse } from "next/server";
import { SHOPIFY_OAUTH_SCOPE_PARAM } from "@/src/lib/shopify";
import {
  buildShopifyAuthorizeUrl,
  buildShopifyCallbackUrl,
  getAuthoritativeAppUrl,
  getShopifyClientId,
} from "@/src/lib/server/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OLD_CLIENT_ID = "24213edaf24cb461e7ab61fb517dd938";
const TEST_SHOP_DOMAIN = "t77bxp-vm.myshopify.com";
const TEST_STATE = "debug-state";

function prefix(value: string): string {
  return value.slice(0, 8);
}

function suffix(value: string): string {
  return value.length >= 7 ? value.slice(-7) : value;
}

export async function GET() {
  const clientId = getShopifyClientId();
  const callbackUrl = buildShopifyCallbackUrl();
  const authorizeUrlForTestShop = clientId
    ? buildShopifyAuthorizeUrl(TEST_SHOP_DOMAIN, TEST_STATE)
    : "";

  return NextResponse.json({
    ok: true,
    appUrl: getAuthoritativeAppUrl(),
    shopifyClientIdPrefix: prefix(clientId),
    shopifyClientIdSuffix: suffix(clientId),
    isOldClientId: clientId === OLD_CLIENT_ID,
    scope: SHOPIFY_OAUTH_SCOPE_PARAM,
    callbackUrl,
    authorizeUrlForTestShop,
  });
}
