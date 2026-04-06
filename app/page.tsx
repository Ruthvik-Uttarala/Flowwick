import { redirect } from "next/navigation";
import { HomeLanding } from "@/src/components/HomeLanding";
import { isShopifyAppLaunch } from "@/src/lib/shopify";
import { buildShopifyLaunchUrl } from "@/src/lib/server/shopify";

interface HomePageProps {
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

export default async function Home({ searchParams }: HomePageProps) {
  const params = toSearchParams(await searchParams);
  if (isShopifyAppLaunch(params)) {
    redirect(buildShopifyLaunchUrl(params));
  }

  return <HomeLanding />;
}
